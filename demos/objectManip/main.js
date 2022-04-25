const _settings = {
  threshold: 0.9, // detection sensitivity, between 0 and 1

  // to get this parameters, open /dev/models3D/handWithPlaceholders.blend
  // and look the pose of CubePalm mesh
  // The real position of the dinosaur compared to the hand is implemented in this Blender file:
  // /dev/models3D/handWithObjectManipDinosaur.blend
  scale: 2.6, 
  translation: [0, -6.73, -1.68],
  quaternion: [0.993, 0, 0, 0.11], // X,Y,Z,W

  // debug flags:
  debugCube: false, // Add a cube
  debugDisplayLandmarks: false,
  debugWholeHand: false
};


const _three = {
  loadingManager: null,
  tracker: null
};

const _states = {
  notLoaded: -1,
  loading: 0,
  running: 1,
  busy: 2
};
let _state = _states.notLoaded;
let _isSelfieCam = false;
let _animationMixer = null, _clock = null;


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
      /*'palmBaseThumb', 'palmSideIndex', 'palmIndexMiddle', 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      'palmWrist', 'palmMiddle', 'palmSide',
      'backMiddle', 'backWrist', 'backTop'*/
      'backMiddle',/*'backWrist',*/ 'palmBaseThumb', 'palmSideIndex', /*'palmIndexMiddle',*/ 'palmMiddleRing', 'palmRingPinky', 'palmSidePinky',
      /*'palmWrist',*/ 'palmMiddle', 'palmSide',
      'backTop'
    ],
    poseFilter: PoseFlipFilter.instance({}),
    enableFlipObject: false,
    cameraZoom: 1,
    threshold: _settings.threshold,
    VTOCanvas: VTOCanvas,
    handTrackerCanvas: handTrackerCanvas,
    debugDisplayLandmarks: _settings.debugDisplayLandmarks,
    NNsPaths: ['../../neuralNets/NN_OBJMANIP_7.json'],
    stabilizationSettings: {
      NNSwitchMask: {
        isRightHand: false
      }
    },
    callbackTrack: callbackTrack
  }).then(start).catch(function(err){
    console.log('INFO in main.js: an error happens ', err);
  });
} 


function callbackTrack(){
  if (_animationMixer){
    _animationMixer.update(_clock.getDelta() * 0.5);
  }
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
  const pointLight = new THREE.PointLight(0xffffff, 2);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  three.scene.add(pointLight, ambientLight);

  // init the tracker, i.e. the object stuck at the palm of the hand:
  _three.tracker = new THREE.Object3D();

  // add a debug cube:
  if (_settings.debugCube){
    const s = 2;
    const cubeGeom = new THREE.BoxGeometry(s,s,s);
    // Move origin from center of the cube to the center of the Y = -1 face:
    const cubeMoveMatrix = new THREE.Matrix4().makeTranslation(0, 1, 0);
    cubeGeom.applyMatrix(cubeMoveMatrix);
    _three.tracker.add(
      new THREE.Mesh(cubeGeom,
      new THREE.MeshNormalMaterial())
    );
  }

  // load the velociraptor 3D model:
  new THREE.GLTFLoader(three.loadingManager).load('assets/velociraptor.glb', function(gltf){
    const animatedObjectContainer = new THREE.Object3D();
    const animatedObject = gltf.scene;
    animatedObjectContainer.add(animatedObject);
    animatedObjectContainer.scale.multiplyScalar(2.5);
    _three.tracker.add(animatedObjectContainer);

    // add to the tracker:
    HandTrackerThreeHelper.add_threeObject(_three.tracker);

    // animate:
    const animationClip = gltf.animations[0];
    _animationMixer = new THREE.AnimationMixer(animatedObject);
    _clock = new THREE.Clock();
    const animationAction = _animationMixer.clipAction( animationClip );
    animationAction.play();
  });

  // tweak position, scale and rotation:
  _three.tracker.scale.multiplyScalar(_settings.scale);
  const d = _settings.translation;
  const displacement = new THREE.Vector3(d[0], d[2], -d[1]); // inverse Y and Z
  _three.tracker.position.add(displacement);
  const q = _settings.quaternion;
  _three.tracker.quaternion.set(q[0], q[2], -q[1], q[3]);

  
  if (_settings.debugWholeHand){
    new THREE.GLTFLoader(three.loadingManager).load('assets/debug/debugHand.glb', function(model){
      const debugHandModel = model.scene.children[0];
      debugHandModel.traverse(function(threeStuff){
        if (threeStuff.material){
          threeStuff.material = new THREE.MeshNormalMaterial();
        }
      })
      HandTrackerThreeHelper.add_threeObject(debugHandModel);
    });
  }
} //end start()


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