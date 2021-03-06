/*global NodeList, HTMLCollection, io, location, moment, queued, msgs, ACT, SLUM, NProgress */

// (function() {
'use strict';

// augment array-like objects with array methods
['forEach', 'map', 'filter', 'reduce', 'reduceRight', 'every', 'some'].forEach(
    function(p) {
    NodeList.prototype[p] = HTMLCollection.prototype[p] = Array.prototype[p];
});

// join socket
var socket = io(location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : ''));
// show any errors
socket.on('error', function(err){
  console.log(err);
});

// track global open runs
var openCount = document.getElementById('open-count');

// check for completed run END values and update them on a minute timer
var ENDs = [];
document.querySelectorAll('[data-END]').forEach(function(el) {
  ENDs.push({
    dom: el,
    val: el.getAttribute('data-END')
  });
});
if(ENDs.length) {
  setInterval(function(){
    var now = parseInt(+new Date() / 1000, 10);
    ENDs.forEach(function(END){
      END.dom.innerText = moment.duration((END.val - now), 'seconds').humanize(true);
    });
  }, 60000);
}

// collection of OPEN runs on /open
var OPENs = {};
// get all open runs, store a reference to their dom and value
document.querySelectorAll('.open-run').forEach(function(el) {
  var SLUM = el.getAttribute('data-SLUM');
  OPENs[SLUM] = {
    img: el.querySelector('img'),
    span: el.querySelector('span')
  };
});
// get any dom elements that will hold results for open run totals
document.querySelectorAll('[data-OPEN-TO]').forEach(function(el) {
  var SLUM = el.getAttribute('data-SLUM');
  var TO = el.getAttribute('data-OPEN-TO');
  if(OPENs[SLUM]) {
    OPENs[SLUM].TO = OPENs[SLUM].TO || {};
  }
  OPENs[SLUM].TO[TO] = el;
});

// collection of DUrations
var DUs = {};
// get all DUs, store a reference to their dom and value
document.querySelectorAll('[data-DU]').forEach(function(el) {
  var SLUM = el.getAttribute('data-SLUM');
  DUs[SLUM] = {
    dom: el,
    val: el.getAttribute('data-DU')
  };
});
// if there are DUs on the page, set up the interval to update them
if(Object.keys(DUs).length) {
  var DUInterval = setInterval(function(){
    for(var DU in DUs){
      // queued runs should not start counting
      if(!queued[DU]) {
        DUs[DU].dom.innerText = ++DUs[DU].val;
      }
    }
    if(Object.keys(DUs).length === 0) {
      clearInterval(DUInterval);
    }
  }, 1000);
}

// ACT will be set if viewing an active run, which will have a key of SLUM

// active running run at job/<foo>/run
if(ACT) {
  // configure the faux progress bar
  NProgress.configure({ showSpinner: false, trickleRate: 0.02 });

  // control for killing the run
  var killed;
  var killswitch = document.getElementById('kill-switch');
  if(killswitch) {
    killswitch.addEventListener('click', function(){
      NProgress.done();
      killed = true;
      socket.emit('kill', SLUM);
      killswitch.style.display = 'none';
      document.getElementById('kill-switch-done').style.display = 'block';
    });
  }

  // run controls and output
  var runCtrls = document.getElementById('run-ctrls');
  if(runCtrls) {
    var autoscroll = true;
    var log = {};

    // setup autoscroll
    document.getElementById('auto-scroll').addEventListener('click', function(){
      autoscroll = !autoscroll;
    });

    // play out the log messages
    var playMsg = function playMsg(msg){
      // start the progress bar if joining a run part way through
      if(!killed && !NProgress.isStarted()){
        NProgress.start();
      }
      // add line output to the relevant log viewers
      if(msg.type === 'ln') {
        ['mini', 'full'].forEach(function(size){
          var li = document.createElement('li');
          li.innerHTML = li.innerHTML + msg.val;
          log[msg.test].dom[size].appendChild(li);
        });
        // if autoscroll is on, scroll to the newly added line
        if(autoscroll && log[msg.test].visible) {
          // objDiv.scrollTop = objDiv.scrollHeight;
          log[msg.test].dom.viewer.scrollTop = log[msg.test].dom.viewer.scrollHeight;
          // log[msg.test].dom.tip.scrollIntoView(true);
        }
        return;
      }
    };

    // get references to log outputs and handle clicks for which mini log to show
    document.getElementsByClassName('test-log-viewer').forEach(function(el) {
      log[el.getAttribute('data-test')] = {
        dom: {
          viewer: el
        },
        visible: false
      };
    });
    document.getElementsByClassName('test-log-full').forEach(function(el) {
      log[el.getAttribute('data-test')].dom.full = el;
    });
    document.getElementsByClassName('test-log-mini').forEach(function(el) {
      var test = el.getAttribute('data-test');
      log[test].dom.mini = el;
      el.addEventListener('click', function(){
        for(var i in log) {
          log[i].visible = false;
          log[i].dom.viewer.style.display = 'none';
        }
        log[test].dom.viewer.style.display = 'block';
        log[test].visible = true;
        window.scroll(0,0);
      });
    });

    // dom references to update for run results
    var result = {
      img: document.getElementById('run-result-img'),
      span: document.getElementById('run-result-span')
    };

    // if loading an open run with a dumped set of historical messages, play them out
    if(msgs) {
      msgs.forEach(function(msg){
        playMsg(msg);
      });
    }

    // join the socket.io room for the active run
    if(ACT && SLUM) {
      socket.emit('join', SLUM);
    }

    // respond to incoming messages
    socket.on('run', playMsg);
  }
}

// responding to general open run broadcasts across the site
socket.on('open', function(msg){
  console.log(msg);
  if(msg.type === 'END') {
    openCount.innerText = msg.open;
    // finished the active run, end the progress bar and remove the kill switch
    if(ACT && SLUM && (msg.SLUM === SLUM) && (!killed && killswitch)) {
      NProgress.done();
      killswitch.style.display = 'none';
    }
    // update any duration timers for this SLUM
    if(DUs[msg.SLUM]) {
      // if a duration timer never really got going, set its final value to 0
      if(DUs[msg.SLUM].dom.innerText === 'wait'){
        DUs[msg.SLUM].dom.innerText = 0;
      }
      // add the done class for visual affect
      if (DUs[msg.SLUM].dom.classList) {
        DUs[msg.SLUM].dom.classList.add('run-done');
      } else {
        // IE9 compat
        DUs[msg.SLUM].dom.className += ' ' + 'run-done';
      }
      // remove the duration timer
      delete DUs[msg.SLUM];
    }
    // update the active run final status
    if(ACT && msg.SLUM === SLUM) {
      result.span.innerText = msg.ST;
      result.img.src = '/img/' + msg.ST + '.png';
      result.span.className = 'bg-' + msg.ST;
    }
    // update run status on /open and runs list for a job
    if(OPENs && OPENs[msg.SLUM]) {
      OPENs[msg.SLUM].span.innerText = msg.ST;
      OPENs[msg.SLUM].img.src = '/img/' + msg.ST + '.png';
      OPENs[msg.SLUM].span.className = 'bg-' + msg.ST;
      if (OPENs[msg.SLUM].TO) {
        Object.keys(OPENs[msg.SLUM].TO).forEach(function(TO) {
          OPENs[msg.SLUM].TO[TO].innerText = msg.TO[TO];
        });
      }
    }
    return;
  }
  // starting a run
  if(msg.type === 'STA') {
    openCount.innerText = msg.open;
    // note that the run is no longer queued
    delete queued[msg.SLUM];
    if(!NProgress.isStarted() && ACT && SLUM && (msg.SLUM === SLUM)) {
      NProgress.start();
    }
    return;
  }
});

// }());
