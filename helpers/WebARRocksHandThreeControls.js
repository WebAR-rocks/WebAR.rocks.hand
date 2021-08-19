/**
 * Copyright 2020 WebAR.rocks ( https://webar.rocks )
 * 
 * WARNING: YOU SHOULD NOT MODIFY THIS FILE OTHERWISE WEBAR.ROCKS
 * WON'T BE RESPONSIBLE TO MAINTAIN AND KEEP YOUR ADDED FEATURES
 * WEBAR.ROCKS WON'T BE LIABLE FOR BREAKS IN YOUR ADDED FUNCTIONNALITIES
 *
 * WEBAR.ROCKS KEEP THE RIGHT TO WORK ON AN UNMODIFIED VERSION OF THIS SCRIPT.
 * 
 * THIS FILE IS A HELPER AND SHOULD NOT BE MODIFIED TO IMPLEMENT A SPECIFIC USER SCENARIO
 * OR TO ADDRESS A SPECIFIC USE CASE.
 */

// Require hammer.js and Tween.js

const WebARRocksHandThreeControls = (function(){
  const _defaultSpec = {    
    domElement: null,
    isEnabled: true,
    threeCamera: null,
    threeObject: null,
    parentPoseMat: null,
    scaleRange: [0.5, 3],
    scaleFactor: 0.5,
    rotYFactor: 0.5, // number of rotation around Y axis if the user pan on the full screen
    mode0: 'hand',
    isMirrorX: false,
    transitionDuration: 500, // in ms
    rotXRange: [-Math.PI/3, Math.PI/3], // rotation X range in radians
    eulerOrder: 'XYZ',
    switchFromPinchToPanDScale: 0.2,
    minDelayPanAfterPinch: 100,

    debugAppendCubeAtOrigin: false
  };
  let _spec = null;
  let _hm = null;

  const _dragTypes = {
    none: -1,
    pan1: 0,
    pan2: 1,
    pinch: 2
  };
  const _transformTypes = {
    none: -1,
    rotate: 0,
    translate: 1,
    scale: 2
  };
  const _mapDragTypesToTransform = {};  
  let _dragType = _dragTypes.none;

  const _three = {
    eulerObj: null,
    eulerView: null,
    quaternionObj: null,
    quaternionView: null,
    quaternionObjectToCamera: null,
    quaternionCameraToObject: null,
    mat4: null,
    vec4: null,
    posViewRef: null,
    posObject: null,
    posCenterClipped: null,
    posClipped: null
  };

  const _pose0 = {
    euler: null,
    quaternion: null,
    position: null,
    scale: -1,
    scale0: 1,
    parentPoseMatPrevious: null
  };

  const _timestamps = {
    lastPinch: -1
  };

  const _modes = {
    undef: -1,
    hand: 0,
    manual: 1
  };

  const _prev = { 
    rx: 0,
    ry: 0
  };
  let _mode = _modes.undef;
  let _isTransition = false;
  
  const _tweens = {
    transition: []
  }
  let _trackerParentPose0 = null, _trackerParentPose = null;

  const _deg2rad = Math.PI/180;


  function get_width(){
    return window.innerWidth;
  }


  function get_height(){
    return window.innerHeight;
  }


  function get_timestamp(){
    return Date.now();
  }


  function extract_dxFromHMEvent(e){
    let dx = e.deltaX;
    if (_spec.isMirrorX){
      dx *= -1;
    }
    return dx;
  }


  function extract_dyFromHMEvent(e){
    return e.deltaY;
  }


  function save_pose(){
    console.log('INFO in WebARRocksHandThreeControls: save_pose()');
    _prev.rx = 0;
    _prev.ry = 0;

    _pose0.position.copy(_spec.threeObject.position);
    _pose0.scale = _spec.threeObject.scale.x;
  }


  function scale(eventScale){
    let s = _pose0.scale * (1 + _spec.scaleFactor * (eventScale - 1));
    s = Math.min(s, _spec.scaleRange[1]);
    s = Math.max(s, _spec.scaleRange[0]);

    _spec.threeObject.scale.set(s, s, s);
  }


  function rotate(dx, dy){
    const w = get_width(), h = get_height();
    const rkx = _spec.rotYFactor * 2 * Math.PI;
    const rky = rkx * h / w;

    const ry = rkx * dx / w;
    const rx = (_mode === _modes.manual) ? rky * dy / h : 0;

    // compute differences:
    const dry = ry - _prev.ry;
    const drx = rx - _prev.rx;
    _prev.rx = rx;
    _prev.ry = ry;

    // update rotation euler angle:
    let ex = _pose0.euler.x + drx;
    let ey = _pose0.euler.y + dry;

    // clamp rotation around X axis:
    ex = Math.max(_spec.rotXRange[0], ex);
    ex = Math.min(_spec.rotXRange[1], ex);

    _pose0.euler.set(ex, ey, 0, _spec.eulerOrder);
    
    // apply rotation around Y axis in object ref:
    _three.eulerObj.set(0, ey, 0, _spec.eulerOrder);
    _three.quaternionObj.setFromEuler(_three.eulerObj);
    
    // apply rotation arounx X axis in view ref:
    _three.eulerView.set(ex, 0, 0, _spec.eulerOrder);
    _three.quaternionView.setFromEuler(_three.eulerView);
    
    // quaternion from object to camera (view ref);
    const q = _three.quaternionObjectToCamera;
    const qInv =  _three.quaternionCameraToObject;
    _spec.threeObject.quaternion.copy(_pose0.quaternion);
    _spec.threeObject.getWorldQuaternion(q);
    q.premultiply(_spec.threeCamera.quaternion);
    qInv.copy(q).invert();
    _three.quaternionView.premultiply(qInv).multiply(q);

    _spec.threeObject.quaternion.multiply(_three.quaternionView);
    _spec.threeObject.quaternion.multiply(_three.quaternionObj);
  }


  function translate(dx, dy){
    //_spec.threeObject.updateMatrixWorld();

    const posViewRef = _spec.threeObject.getWorldPosition(_three.posViewRef);

    // position of the 3D object in 3D camera ref:
    posViewRef.applyMatrix4(_spec.threeCamera.matrixWorldInverse);
    const dZToCamera = -posViewRef.z;

    // get displacement in viewport coordinates (between -1 and 1):
    const w = get_width(), h = get_height();
    let dxn = dx / w;
    let dyn = - dy/ h;

     // coordinates in world ref of center and displaced point:
    _three.posCenterClipped.set(-dxn, -dyn, 1).unproject(_spec.threeCamera);
    _three.posClipped.set(dxn, dyn, 1).unproject(_spec.threeCamera);

    // get displacement on camera far plane in world coo:
    _three.posClipped.sub(_three.posCenterClipped);

    // go from far plane to object plane
    _three.posClipped.multiplyScalar(dZToCamera / _spec.threeCamera.far);

    // position in world coordinates:
    const deltaPosWorld = _three.posClipped;

    // translate posWorld to object co:
    const posObject = _three.vec4;
    const matrixWorld = _spec.threeObject.parent.matrixWorld;
    const matrixWorldInv = _three.mat4.copy(matrixWorld).invert();
    posObject.copy(deltaPosWorld).setW(0).applyMatrix4(matrixWorldInv).add(_pose0.position).setW(1);    
    _spec.threeObject.position.copy(posObject);
  }


  function clamp_positionToViewport(){
    //const posViewRef = _spec.threeObject.getWorldPosition(_three.posViewRef);
    _spec.threeObject.parent.updateMatrix();
    _spec.threeObject.parent.updateMatrixWorld();
    const matrixWorld = _spec.threeObject.parent.matrixWorld;
    const matrixWorldInv = _three.mat4.copy(matrixWorld).invert();

    const posViewRef = _three.posViewRef;

    // first, to camera co:
    posViewRef.copy(_spec.threeObject.position).applyMatrix4(matrixWorld).applyMatrix4(_spec.threeCamera.matrixWorldInverse);
    
    // compute the values of the ellipse inside the frustum;
    const tanHalfFovRad = Math.tan(_spec.threeCamera.getEffectiveFOV() * _deg2rad / 2);
    const ry = 0.8 * -posViewRef.z * tanHalfFovRad;
    const rx = 0.8 * ry * _spec.threeCamera.aspect;

    const xClamped = Math.min(Math.max(posViewRef.x, -rx), rx);
    const yClamped = Math.min(Math.max(posViewRef.y, -ry), ry);

    const dxClamped = xClamped - posViewRef.x;
    const dyClamped = yClamped - posViewRef.y;

    //posViewRef.setX(xClamped).setY(yClamped);
    posViewRef.setX(posViewRef.x + 0.1 * dxClamped).setY(posViewRef.y + 0.1 * dyClamped);

    // go back to object co:
    const posObject = _three.posObject;
    posObject.copy(posViewRef).applyMatrix4(_spec.threeCamera.matrixWorld).applyMatrix4(matrixWorldInv);
    _spec.threeObject.position.copy(posObject);
  }


  function set_transitionState(){
    _isTransition = true;

    _pose0.euler.set(0, 0, 0, _spec.eulerOrder);
    _pose0.quaternion.copy(_spec.threeObject.quaternion);
    
    // top all current transition tweens:
    _tweens.transition.forEach(function(tt){
      tt.stop();
    });
    _tweens.transition.splice(0);
  }


  function allocate_threeStuffs(){
    _three.eulerObj = new THREE.Euler();
    _three.eulerView = new THREE.Euler();
    _three.quaternionObj = new THREE.Quaternion();
    _three.quaternionView = new THREE.Quaternion();
    _three.quaternionObjectToCamera = new THREE.Quaternion();
    _three.quaternionCameraToObject = new THREE.Quaternion();
    _three.posViewRef = new THREE.Vector3();
    _three.posObject = new THREE.Vector3();
    _three.posCenterClipped = new THREE.Vector3();
    _three.posClipped = new THREE.Vector3();
    _three.mat4 = new THREE.Matrix4();
    _three.vec4 = new THREE.Vector4();

    _pose0.euler = new THREE.Euler();
    _pose0.quaternion = new THREE.Quaternion();
    _pose0.position = new THREE.Vector3();
    _pose0.parentPoseMatPrevious = new THREE.Matrix4();
  }


  function rotate_orTranslate(hmEvent){
    const dx = extract_dxFromHMEvent(hmEvent), dy = extract_dyFromHMEvent(hmEvent);
    const transformType = _mapDragTypesToTransform[_dragType];
    if (transformType === _transformTypes.translate){
      translate(dx, dy);
    } else if (transformType === _transformTypes.rotate){
      rotate(dx, dy);
    }
  }


  function init_hmPinch(){
    const hmPinch = new Hammer.Pinch();
    _hm.add([hmPinch]);
    _hm.on('pinch', function(e){
      if (!that.is_interactive()) return;
      if (_dragType === _dragTypes.pan2 && Math.abs(1 - e.scale) > _spec.switchFromPinchToPanDScale) {
        _dragType = _dragTypes.pinch;
        _pose0.scale0 = e.scale;
      }

      if(_dragType === _dragTypes.pinch && e.scale > 0){
        scale(e.scale / _pose0.scale0);
      } else if (_dragType === _dragTypes.pan2){
        rotate_orTranslate(e);
      }
    })
    _hm.on('pinchstart', function(e){
      if (_dragType !== _dragTypes.none || !that.is_interactive()){
        return;
      }
      _dragType = _dragTypes.pan2;
      save_pose();
    });
    _hm.on('pinchend', function(e){
      if (_dragType !== _dragTypes.pinch && _dragType !== _dragTypes.pan2){
        return;
      }
      _timestamps.lastPinch = get_timestamp();
      _dragType = _dragTypes.none;
    });
  }


  function init_hmPan(){
    const hmPan = new Hammer.Pan({ dragMaxTouches: 2 });
    _hm.add([hmPan]);
    _hm.on('panstart', function(e){
      if (_dragType !== _dragTypes.none || !that.is_interactive()){
        return;
      }
      const currentTimestamp = get_timestamp();
      if (currentTimestamp - _timestamps.lastPinch < _spec.minDelayPanAfterPinch){
        return;
      }
      _dragType = _dragTypes.pan1;
      save_pose();
    });
    _hm.on('pan', function(e){
      if (!that.is_interactive() || _dragType !== _dragTypes.pan1) return;
      rotate_orTranslate(e);
    });
    _hm.on('panend', function(e){
      if (_dragType !== _dragTypes.pan1){
        return;
      }
      _dragType = _dragTypes.none;
    });
  }


  function extract_trackerParentPose(mat, trackerParentPose){
    trackerParentPose.position.setFromMatrixPosition(mat);
    trackerParentPose.quaternion.setFromRotationMatrix(mat);
  }


  function do_tweenHandDetectedSmoothDisplacementForParent(){
    const tweenHandDetectedSmoothDisplacement = new TWEEN.Tween({t: 0}).to({t: 1}, _spec.transitionDuration).onUpdate(function(v){
      const t = v.t;
      
      // what pose should be without tweening:
      extract_trackerParentPose(_spec.parentPoseMat, _trackerParentPose);

      // mix with start pose:
      _trackerParentPose.position.lerp(_trackerParentPose0.position, 1-t);
      _trackerParentPose.quaternion.slerp(_trackerParentPose0.quaternion, 1-t);
      
      // update movement matrix:
      const mat = _spec.parentPoseMat;
      mat.makeRotationFromQuaternion(_trackerParentPose.quaternion);
      mat.setPosition(_trackerParentPose.position);
      
    }).easing(TWEEN.Easing.Quadratic.Out);
    tweenHandDetectedSmoothDisplacement.start();
    _tweens.transition.push(tweenHandDetectedSmoothDisplacement)
  }


  function init_trackerParentPoses(){
    const create_pose = function(){
      return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
      };
    }  
    _trackerParentPose = create_pose();
    _trackerParentPose0 = create_pose();
  }


  function set_mode(newMode){
    if (newMode === _modes.hand){
      _mapDragTypesToTransform[_dragTypes.pan1] = _transformTypes.rotate;
      _mapDragTypesToTransform[_dragTypes.pan2] = _transformTypes.none;
    } else if (newMode === _modes.manual){
      _mapDragTypesToTransform[_dragTypes.pan1] = _transformTypes.translate;
      _mapDragTypesToTransform[_dragTypes.pan2] = _transformTypes.rotate;      
    }
    _mode = newMode;
  }


  const that = {
    init: function(spec){
      console.log('INFO in WebARRocksHandThreeControls: init()');
      _spec = Object.assign({}, _defaultSpec, spec);

      set_mode({
        'hand': _modes.hand,
        'manual': _modes.manual
      }[_spec.mode0]);

      // init THREE.js stuffs:
      allocate_threeStuffs();
      init_trackerParentPoses();     
      
      // init hammer.js
      _hm = new Hammer.Manager(_spec.domElement);

      init_hmPinch();
      init_hmPan();
    },


    is_interactive: function(){
      return (_spec.isEnabled && !_isTransition);
    },


    attach: function(threeObject, parentPoseMat){
      _spec.threeObject = threeObject;
      _spec.parentPoseMat = parentPoseMat;

      if (_spec.debugAppendCubeAtOrigin){
        const s = 0.5;
        const debugCube = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), new THREE.MeshNormalMaterial({}));
        threeObject.add(debugCube);
      }
    },


    tick: function(){
      if (_mode === _modes.manual){
        clamp_positionToViewport();
        _pose0.parentPoseMatPrevious.copy(_spec.parentPoseMat);
      }
    },


    toggle: function(isEnabled){
      if (!isEnabled){
        _dragType = _dragTypes.none;
      }
      _spec.isEnabled = isEnabled;
    },


    update: function(newSpec){
      if (!_spec) return;
      Object.assign(_spec, newSpec);
    },


    to_manual: function(){
      if (_mode === _modes.manual){
        return Promise.reject();
      }

      set_transitionState();

      // start quaternion:
      const qStart = new THREE.Quaternion().setFromRotationMatrix(_spec.parentPoseMat);

      // compute quaternion with no rotation around Z view axis, qEnd:
      const qWorld = new THREE.Quaternion();
      _spec.threeObject.getWorldQuaternion(qWorld);
      const euler = new THREE.Euler().setFromQuaternion(qWorld,'ZXY');
      euler.set(euler.x, euler.y, 0, 'ZXY');      
      //euler.set(0, euler.y, 0, 'YXZ');      
      const qEndWorld = new THREE.Quaternion().setFromEuler(euler);
      const qWorldInv = qWorld.clone().invert();
      // transformation in world ref:
      const qWorldTransf = qWorldInv.clone().premultiply(qEndWorld);
      const qEnd = qStart.clone().premultiply(qWorldTransf);
            

      const qSlerp = new THREE.Quaternion();      
      const pos = new THREE.Vector3();

      return new Promise(function(accept, reject){

        // we need to reset rotation around view Z axis for parent:
        const tweenResetRotZViewAxis = new TWEEN.Tween({t: 0}).to({t: 1}, _spec.transitionDuration).onUpdate(function(v){
          const t = v.t;
          qSlerp.slerpQuaternions(qStart, qEnd, t);
          
          // update movement matrix:
          const mat = _spec.parentPoseMat;
          pos.setFromMatrixPosition(mat); // save position
          mat.makeRotationFromQuaternion(qSlerp);
          mat.setPosition(pos); // restore position
          
        }).easing(TWEEN.Easing.Quadratic.Out);

        _tweens.transition.push(tweenResetRotZViewAxis);

        tweenResetRotZViewAxis.onComplete(function(){
          _isTransition = false;
          set_mode(_modes.manual);
          accept();
        });
        tweenResetRotZViewAxis.start();
      });      
    },


    to_hand: function(){
      if (_mode === _modes.hand){
        return Promise.reject();
      }

      set_transitionState();
      extract_trackerParentPose(_pose0.parentPoseMatPrevious, _trackerParentPose0);
  
      return new Promise(function(accept, reject){
        // remove translation and rx components:
        const tweenTranslation = new TWEEN.Tween(_spec.threeObject.position).to({
          x:0, y:0, z:0
        }, _spec.transitionDuration).easing(TWEEN.Easing.Quadratic.Out);

        // compute the quaternion where only ry remains:
        const eulerTo = new THREE.Euler().setFromQuaternion(_spec.threeObject.quaternion, 'YXZ');
        eulerTo.set(0, eulerTo.y, 0);
        const quaternionTo = new THREE.Quaternion().setFromEuler(eulerTo);
        const quaternionFrom = _spec.threeObject.quaternion.clone();

        const tweenRotation = new TWEEN.Tween({t: 0}).to({t: 1}, _spec.transitionDuration).onUpdate(function(v){
          const t = v.t;
          _spec.threeObject.quaternion.copy(quaternionFrom).slerp(quaternionTo, t);
        }).easing(TWEEN.Easing.Quadratic.Out);

        tweenTranslation.start();
        tweenRotation.start();
        _tweens.transition.push(tweenTranslation, tweenRotation);

        do_tweenHandDetectedSmoothDisplacementForParent();

        tweenTranslation.onComplete(function(){
          _isTransition = false;
          set_mode(_modes.hand);
          accept();
        })
      });
    },


    destroy: function(){
      if (TWEEN){
        TWEEN.removeAll();
      }
      _tweens.transition.splice(0);
      _dragType = _dragTypes.none;
      _isTransition = false;
      _mode = _modes.undef;
    }
  } // end that

  return that;
})(); 


// Export ES6 module:
try {
  module.exports = WebARRocksHandThreeControls;
} catch(e){
  console.log('ES6 Module not exported');
}

