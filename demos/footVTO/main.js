
const _settings = {
  threshold: 0.75, // detection sensitivity, between 0 and 1
  NNVersion: 23, // best: 23

  // CONVERSES SHOES:
  // 3D models:
  shoeRightPath: 'assets/converseShoe2.glb',
  isModelLightMapped: true,
  occluderPath: 'assets/occluder.glb',

  // pose settings:
  scale: 0.95,
  translation: [0, -0.02, 0], // Z -> verical, Y+ -> front way

  /*
  // BALLERINA SHOES:  
  // 3D models:
  shoeRightPath: 'assets/ballerinaShoe.glb',
  isModelLightMapped: false,
  occluderPath: 'assets/occluder.glb',

  // pose settings:
  scale: 1.2,
  translation: [0, 0.01, -0.02], // Z -> verical
  //*/

  // debug flags:
  debugCube: false, // Add a cube
  debugDisplayLandmarks: true
};

const _three = {
  loadingManager: null
}

const _states = {
  notLoaded: -1,
  loading: 0,
  running: 1,
  busy: 2
};
let _state = _states.notLoaded;
let _isSelfieCam = false;


function setFullScreen(cv){
  cv.width = window.innerWidth;
  cv.height = window.innerHeight;
}


// entry point:
function main(){
  _state = _states.loading;

  const handTrackerCanvas = document.getElementById('handTrackerCanvas');
  const VTOCanvas = document.getElementById('ARCanvas');

  setFullScreen(handTrackerCanvas);
  setFullScreen(VTOCanvas);

  HandTrackerThreeHelper.init({
    poseLandmarksLabels: [
      'ankleBack', 'ankleOut', 'ankleIn', 'ankleFront',
      'heelBackOut', 'heelBackIn',
      'pinkyToeBaseTop', 'middleToeBaseTop', 'bigToeBaseTop'
    ],
    enableFlipObject: true,//true,
    cameraZoom: 1,
    freeZRot: false,
    threshold: _settings.threshold,
    scanSettings: {
      multiDetectionSearchSlotsRate: 0.5,
      multiDetectionMaxOverlap: 0.3,
      multiDetectionOverlapScaleXY: [0.5, 1],
      multiDetectionEqualizeSearchSlotScale: true, 
      multiDetectionForceSearchOnOtherSide: true,
      multiDetectionForceChirality: 1,
      disableIsRightHandNNEval: true,
      overlapFactors: [1.0, 1.0, 1.0],
      translationScalingFactors: [0.3, 0.3, 1],
      nScaleLevels: 2, // in the higher scale level, the size of the detection window is the smallest video dimension
      scale0Factor: 0.5
    },
    VTOCanvas: VTOCanvas,
    handTrackerCanvas: handTrackerCanvas,
    debugDisplayLandmarks: false,
    NNsPaths: ['../../neuralNets/NN_FOOT_' + _settings.NNVersion.toString() + '.json'],
    maxHandsDetected: 2,
    stabilizationSettings: {
      //qualityFactorRange: [0.4, 0.7],
      NNSwitchMask: {
        isRightHand: false,
        isFlipped: false
      }
    },
    landmarksStabilizerSpec: { 
      minCutOff: 0.001,
      beta: 3 // lower => more stabilized
    }
  }).then(function(three){
    handTrackerCanvas.style.zIndex = 3; // fix a weird bug on iOS15 / safari
    start(three);
  }).catch(function(err){
    console.log('INFO in main.js: an error happens ', err);
  });
} 


function start(three){
  three.loadingManager.onLoad = function(){
    console.log('INFO in main.js: Everything is loaded');
    _state = _states.running;
  }

  // set tonemapping:
  three.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  three.renderer.outputEncoding = THREE.sRGBEncoding;

  // set lighting:
  if (!_settings.isModelLightMapped){
    const pointLight = new THREE.PointLight(0xffffff, 2);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    three.scene.add(pointLight, ambientLight);
  }

  // add a debug cube:
  if (_settings.debugCube){
    const s = 1;
    const cubeGeom = new THREE.BoxGeometry(s,s,s);
    const cubeMesh = new THREE.Mesh(cubeGeom,new THREE.MeshNormalMaterial());
    HandTrackerThreeHelper.add_threeObject(cubeMesh);
  }

  function transform(threeObject){
    threeObject.scale.multiplyScalar(_settings.scale);
    threeObject.position.add(new THREE.Vector3().fromArray(_settings.translation));
  }

  // load the shoes 3D model:
  new THREE.GLTFLoader().load(_settings.shoeRightPath, function(gltf){
    const shoe = gltf.scene;
    transform(shoe);
    HandTrackerThreeHelper.add_threeObject(shoe);
  });

  new THREE.GLTFLoader().load(_settings.occluderPath, function(gltf){
    const occluder = gltf.scene.children[0];
    transform(occluder);
    HandTrackerThreeHelper.add_threeOccluder(occluder);
  });
}



function flip_camera(){
  if (_state !== _states.running){
    return;
  }
  _state = _states.busy;
  WEBARROCKSHAND.update_videoSettings({
    facingMode: (_isSelfieCam) ? 'environment' : 'user'
  }).then(function(){
    _isSelfieCam = !_isSelfieCam;
    _state = _states.running;
    // mirror canvas using CSS in selfie cam mode:
    document.getElementById('canvases').style.transform = (_isSelfieCam) ? 'rotateY(180deg)' : '';
    console.log('INFO in main.js: Camera flipped successfully');
  }).catch(function(err){
    console.log('ERROR in main.js: Cannot flip camera -', err);
  });
}


window.addEventListener('load', main);