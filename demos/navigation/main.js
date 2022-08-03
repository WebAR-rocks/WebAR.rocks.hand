// entry point:
function main(){ 
  init_handTracking();
}


function init_handTracking(){
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
    //NNsPaths: [NNPath + 'NN_NAV_RP_9.json', NNPath + 'NN_NAV_RB_9.json'],
    NNsPaths: [NNPath + 'NN_NAV_21.json'],
    threshold: 0.95,
    videoSettings: {
      idealWidth: Math.max(idealHeight, idealWidth),
      idealHeight: Math.min(idealHeight, idealWidth),
    },
    callbackReady: function(err, objs){
      if (err){
        console.log('INFO in main.js: err = ', err);
        if (err === 'WEBCAM_UNAVAILABLE'){
          document.getElementById('enableCamera').style.display = 'block';
        }
        return;
      }

      // correct a bug on iOS when the website is open in a new tab
      // (space between canvas and video on top of the page):
      HandTrackerNavigationHelper.resize();

      document.getElementById('enableCamera').style.display = 'none';
      if (objs.isMobileOrTablet){
        document.getElementById('changeCamera').style.display = 'block';
      }
    },

    // video display:
    GLSLChangeVideoColor: '\
      float grayScale = dot(color.rgb, vec3(0.299, 0.587, 0.114));\n\
      color =  vec4(grayScale * vec3(0., 0., 1.), 1.0);\n\
    ',

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
    GLSLPointerPointColor: 'color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vIsPointer * downFactor);',
    GLSLPointerCursorColor: 'color = mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), downFactor);',
    cursorAngle: 30, // in degrees
    cursorRecess: 0.33,
    cursorSizePx: 32,

    // pointer logic:
    pointerLandmarks: ['index0', 'thumb0'],
    pointerDistancesPalmSide: [0.35, 0.3], // relative to hand detection window. hysteresis
    pointerDistancesBackSide: [0.25, 0.2],
    pointerHeatDistance: 0.05, // pointer start changing color
    pointerBlendHandRadiusRange: [1, 3], // relative to pointer size. start and stop blending around the pointer

    onPointerDown: function(x, y){
      console.log('Pointer down at position: ', x, y);
    },
    onPointerUp: function(x, y){
      console.log('Pointer up at position: ', x, y);
    },
    onPointerMove: function(x, y, isDown){

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