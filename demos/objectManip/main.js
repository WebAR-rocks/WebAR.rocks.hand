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
let _isSelfieCam = true;
let _animationMixer = null, _clock = null;


function size_canvas(cv){
  const pixelRatio = window.devicePixelRatio || 1;
  cv.width = pixelRatio * Math.min(window.innerWidth, window.innerHeight);
  cv.height = pixelRatio * window.innerHeight;
}


function is_mobileOrTablet(){
  let check = false;
  // from https://stackoverflow.com/questions/3514784/what-is-the-best-way-to-detect-a-mobile-device
  if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent) 
      || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0,4))) { 
      check = true;
  }
  return check;
}


// entry point:
function main(){
  _state = _states.loading;

  const handTrackerCanvas = document.getElementById('handTrackerCanvas');
  const VTOCanvas = document.getElementById('ARCanvas');

  size_canvas(handTrackerCanvas);
  size_canvas(VTOCanvas);

  set_canvasMirroring(!is_mobileOrTablet());

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
    set_canvasMirroring(_isSelfieCam);

    console.log('INFO in main.js: Camera flipped successfully');
  }).catch(function(err){
    console.log('ERROR in main.js: Cannot flip camera -', err);
  });
}


function set_canvasMirroring(isMirror){
  const CSSTransformValue = (isMirror) ? 'rotateY(180deg) translate(50%)' : 'translate(-50%)';
  document.getElementById('canvases').style.transform = CSSTransformValue;
}

window.addEventListener('load', main);