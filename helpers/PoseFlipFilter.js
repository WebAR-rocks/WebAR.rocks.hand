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

const PoseFlipFilter = (function(){
  const _defaultSpec = {
    dpMinPx: 5, // minimum mean point displacement. Should be >0. If 0, pose movement may stall when points are motionless
    dPixRotTol: 6, // higher -> more responsive but less filtering
    dPixTransTol: 20, // higher -> more responsive
    startStabilizeCounter: 20 // iterations count before starting stabilization after reset() called
  };


  function clone_imagePointPositions(ipp){
    return ipp.map(function(p){
      return [p[0], p[1]];
    });
  }


  function copy_imagePointPositions(src, dst){
    src.forEach(function(p, pi){
      dst[pi][0] = p[0], dst[pi][1] = p[1];
    })
  }


  function compute_dpMax(ipp0, ipp1){
    let mx = -1;
    const n = ipp0.length;
    for (let i=0; i<n; ++i){
      const dx = ipp0[i][0] - ipp1[i][0], dy = ipp0[i][1] - ipp1[i][1];
      mx = Math.max(mx, dx*dx + dy*dy);
    }
    return Math.sqrt(mx);
  }


  function compute_dpMean(ipp0, ipp1){
    let dpSum = 0;
    const n = ipp0.length;
    for (let i=0; i<n; ++i){
      const dx = ipp0[i][0] - ipp1[i][0], dy = ipp0[i][1] - ipp1[i][1];
      dpSum += Math.sqrt(dx*dx + dy*dy);
    }
    return (dpSum / n);
  }


  const superThat = {
    instance: function(spec){
      const _spec = Object.assign({}, _defaultSpec, spec);

      const _previous = {
        imagePointPositions: null,
        threeQuaternion: new THREE.Quaternion(),
        threePosition: new THREE.Vector3()
      };
      let _resetCounter = 0;
      
      const _threeFilteredMatMov = new THREE.Matrix4();
      const _threeWP = new THREE.Vector3(); // working point;

      // input pose extracted parameters:
      const _threeQuaternion = new THREE.Quaternion();
      const _threePosition = new THREE.Vector3();
      const _threeScale = new THREE.Vector3(1,1,1);

      // applied parameters:
      const _threeQuaternionApplied = new THREE.Quaternion();
      const _threePositionApplied = new THREE.Vector3();

      // bounding volumes:
      const _threeBB = new THREE.Box3();
      const _threeBS = new THREE.Sphere();
      let _boundingSphereRadius = -1;
      

      const _epsilon = 0.01;

      
      function compute_objectBoundingSphereRadius(threeObject){
        const threeObjectWithoutOccluders = threeObject.clone();
        for (let i=threeObjectWithoutOccluders.children.length-1; i>=0; --i){
          const child = threeObjectWithoutOccluders.children[i];
          if (child.userData.isOccluder){
            threeObjectWithoutOccluders.remove(child);
          }
        }
        _threeBB.setFromObject(threeObjectWithoutOccluders);
        _threeBS.setFromPoints([_threeBB.min, _threeBB.max]);
        return _threeBS.radius;
      }


      function compute_apparentDiameterPx(radius, threeMatMov, threeCamera, viewHeightPx){
        
        // compute zObject, distance between camera and object center along Z axis
        _threeWP.set(0, 0, 0); // center of threeObject in threeObject ref
        _threeWP.applyMatrix4(threeMatMov); // center of threeObject in world ref;
        _threeWP.applyMatrix4(threeCamera.matrixWorldInverse); // center of threeObject in view ref;
        const zObject = -_threeWP.z;
        
        const halfFovRad = threeCamera.fov * Math.PI / 360;
        const d = radius * viewHeightPx / (zObject * Math.tan(halfFovRad));

        return d;
      }


      const that = {
        clone: function(){
          return superThat.instance(_spec);
        },


        update: function(imagePointPositions, threeObject, threeCamera, viewHeightPx, threeMatMov){
          let threeFilteredMatMov = threeMatMov;

          // extract position and rotation:
          _threeQuaternion.setFromRotationMatrix(threeMatMov);
          _threePosition.setFromMatrixPosition(threeMatMov);

          if (++_resetCounter <= _spec.startStabilizeCounter){
            _previous.imagePointPositions = clone_imagePointPositions(imagePointPositions);
            _previous.threeQuaternion.copy(_threeQuaternion);
            _previous.threePosition.copy(_threePosition);

            if (_boundingSphereRadius < 0){ // costly to compute, we should not do it often
              _boundingSphereRadius = compute_objectBoundingSphereRadius(threeObject);
              if (isNaN(_boundingSphereRadius)){
                _resetCounter = 0;
              }
            }
          } else {
            // GET METRICS FROM 2D POINT DISPLACEMENT: 
            // compute the maximum displacement of image points:
            const dp = Math.max(_spec.dpMinPx, compute_dpMax(imagePointPositions, _previous.imagePointPositions));
            //const dp = compute_dpMean(imagePointPositions, _previous.imagePointPositions);

            // GET METRICS FROM POSE CHANGE:
            // compute angle and position changes:
            const dAngle = _threeQuaternion.angleTo(_previous.threeQuaternion);            
            const dPos = _threePosition.distanceTo(_previous.threePosition);

            // COMPUTE POSE EFFECTS IN PIXELS:
            // compute apparent diameter of the object in px:
            const apparentDiameterPx = compute_apparentDiameterPx(_boundingSphereRadius, threeMatMov, threeCamera, viewHeightPx);
            
            // compute pixel displacement from rotation then translation:
            const dPixRot = Math.abs(apparentDiameterPx * Math.sin(dAngle));
            const dPixTrans = (apparentDiameterPx / (2 * _boundingSphereRadius)) * dPos;

            // APPLY FILTERING:
            // compute amortization factors, between 0 (full amortization) and 1 (no amortization)
            const rotFactor = Math.min(1, (_epsilon + dp) / (_epsilon + dPixRot / _spec.dPixRotTol));
            const posFactor = Math.min(1, (_epsilon + dp) / (_epsilon + dPixTrans / _spec.dPixTransTol));
            
            /*if (posFactor !==1 || rotFactor !== 1){
              console.log('PoseFlipFilter rot, pos factors: ', rotFactor, posFactor);
            }//*/
            
            // apply amortization factors:
            _threeQuaternionApplied.slerpQuaternions(_previous.threeQuaternion, _threeQuaternion, rotFactor);
            _threePositionApplied.lerpVectors(_previous.threePosition, _threePosition, posFactor);
            
            // save image point positions for next iteration:
            copy_imagePointPositions(imagePointPositions, _previous.imagePointPositions);

            // save applied params for next iteration:
            _previous.threeQuaternion.copy(_threeQuaternionApplied);
            _previous.threePosition.copy(_threePositionApplied);

            // build output matrix:
            _threeFilteredMatMov.compose(_threePositionApplied, _threeQuaternionApplied, _threeScale);
            threeFilteredMatMov = _threeFilteredMatMov;
          }
          
          return threeFilteredMatMov;
        },


        reset: function(){
          _resetCounter = 0;
        }
      }; //end that
      return that;
    }
  } //end superThat
  return superThat;
})();


// Export ES6 module:
try {
  module.exports = PoseFlipFilter;
} catch(e){
  console.log('ES6 Module not exported');
}