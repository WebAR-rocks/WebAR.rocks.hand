const _states = {
  notLoaded: -1,
  loading: 0,
  idle: 1,
  drawing: 2,
  err: 3
};
let _state = _states.notLoaded;

const _drawMode = {
  x: 0, y: 0,
  cv: null,
  ctx: null
};

// entry point:
function main(){ 
  init_handTracking();
}


// API reference: https://revealjs.com/api/
function send_toRevealJsAPI(method, args){
  const frame = document.getElementById('presentationIframe');
  frame.contentWindow.postMessage( JSON.stringify({
    method: method,
    args: args || []
  }), '*' );
}


function go_toNextSlide(){
  clear_canvasDraw();
  send_toRevealJsAPI('next');
}


function go_toPrevSlide(){
  clear_canvasDraw();
  send_toRevealJsAPI('prev');
}


function hide_slidesControls(){
  const config = {
    controls: false
  }
  send_toRevealJsAPI('configure', [config]);
}


function toggle_DOMElementVisibility(eltId, isVisible){
  const elt = document.getElementById(eltId);
  if(elt){
    elt.style.display = (isVisible) ? 'block' : 'none';
  }
}


function init_drawMode(){
  const cv = document.getElementById('canvasDraw');
  _drawMode.cv = cv;
  const ctx = cv.getContext('2d');
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  _drawMode.ctx = ctx;
}


function clear_canvasDraw() {
  _drawMode.ctx.clearRect(0, 0, _drawMode.cv.width, _drawMode.cv.height);
}


function convert_toDrawX(xScreen){
  return xScreen - _drawMode.cv.getBoundingClientRect().left;
}


function convert_toDrawY(yScreen){
  return yScreen - _drawMode.cv.getBoundingClientRect().top;
}


function init_handTracking(){
  _state = _states.loading;

  const NNPath = '../../neuralNets/';

  const dpr = Math.min(2, (window.devicePixelRatio) ? window.devicePixelRatio : 1);
  let idealWidth = window.innerWidth*dpr, idealHeight = window.innerHeight*dpr;
  const maxDim = Math.max(idealWidth, idealHeight);
  const scale = Math.min(1, 1024/maxDim);
  idealWidth = Math.round(idealWidth * scale), idealHeight = Math.round(idealHeight * scale);  
  console.log('Requested video resolution: ', idealWidth, ' * ', idealHeight);


  HandTrackerNavigationHelper.init({
    canvasVideo: document.getElementById('handNavigationCanvasVideo'),
    canvasPointer: document.getElementById('handNavigationCanvasPointer'),
    NNsPaths: [NNPath + 'NN_NAVPALM_1.json'],
    threshold: 0.95,
    videoSettings: {
      idealWidth: Math.max(idealHeight, idealWidth),
      idealHeight: Math.min(idealHeight, idealWidth),
    },
    callbackReady: function(err, objs){
      if (err){
        console.log('INFO in main.js: err = ', err);
        if (err === 'WEBCAM_UNAVAILABLE'){
          toggle_DOMElementVisibility('enableCamera', true);
        }
        _state = _states.err;
        return;
      }

      // correct a bug on iOS when the website is open in a new tab
      // (space between canvas and video on top of the page):
      HandTrackerNavigationHelper.resize();

      toggle_DOMElementVisibility('enableCamera', false);
      if (objs.isMobileOrTablet){
        toggle_DOMElementVisibility('changeCamera', true);
      }

      hide_slidesControls();
      init_drawMode();
      _state = _states.idle;
    },

    // video display:
    /*GLSLChangeVideoColor: '\
      float grayScale = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n\
      color =  vec4(grayScale * vec3(0., 0., 1.), 1.0);\n\
    ',*/

    // pointer display:
    landmarks: [
      "index0", "index1", "index2", "index3",
      "thumb2", "thumb1", "thumb0"
    ],
    lines: [
      ["index0", "index1"], ["index1", "index2"], ["index2", "index3"],
      ["index3", "thumb2"], ["thumb2", "thumb1"], ["thumb1", "thumb0"]
    ],
    lineWidth: 2,
    pointRadius: 12,
    GLSLPointerLineColor: 'color = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.0, 0.0), vIsPointer * downFactor);',
    GLSLPointerPointColor: 'color = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.0, 0.0), vIsPointer * downFactor);',
    GLSLPointerCursorColor: 'color = mix(vec3(0.0, 0.8, 1.0), vec3(1.0, 0.0, 0.0), downFactor);',
    cursorAngle: 30, // in degrees
    cursorRecess: 0.33,
    cursorSizePx: 32,

    // pointer logic:
    pointerDistanceFromIndexTipRelative: 0,
    pointerLandmarks: ['index0', 'thumb0'],
    pointerDistancesPalmSide: [0.35, 0.3], // relative to hand detection window. hysteresis
    pointerDistancesBackSide: [0.35, 0.3],
    pointerHeatDistance: 0.05, // pointer start changing color
    pointerBlendHandRadiusRange: [1, 3], // relative to pointer size. start and stop blending around the pointer

    // margins:
    marginTop: 0,// in px
    marginLeft: 0,
    marginRight: 0,
    marginBottom: 0,

    onPointerDown: function(x, y){
      if (_state !== _states.idle){
        return;
      }

      console.log('Pointer down at position: ', x, y);
      const domElement = document.elementFromPoint(x, y);

      if (!domElement){
        return;
      }
      if (domElement === document.getElementById('presentation')){
        _state = _states.drawing;
        _drawMode.x = convert_toDrawX(x);
        _drawMode.y = convert_toDrawY(y);
      }
      $(domElement).click();
    },

    onPointerUp: function(x, y){
      console.log('Pointer up at position: ', x, y);
      if (_state === _states.drawing){
        _state = _states.idle;
      }
    },

    onPointerMove: function(x, y, isDown){
      if (_state === _states.drawing){
        const xCv = convert_toDrawX(x);
        const yCv = convert_toDrawY(y);

        console.log('draw', x, y);

        const ctx = _drawMode.ctx;
        ctx.beginPath();
        ctx.moveTo(_drawMode.x, _drawMode.y);
        ctx.lineTo(xCv, yCv);
        ctx.stroke();

        _drawMode.x = xCv;
        _drawMode.y = yCv;
      }
    }
  });
}


function enable_camera(){
  HandTrackerNavigationHelper.enable_camera();
}


function change_camera(){
  HandTrackerNavigationHelper.change_camera();
}


window.addEventListener('load', main);