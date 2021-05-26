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

/*

With this stabilizer, we will emulate a second order damping system in critical state (damping ratio = 1)
see https://en.wikipedia.org/wiki/Damping_ratio
We link each stabilized point to the not stabilized landmark through a damping system and we simulate it.

* We estimate the natural frequency of the noise w0
* We fix m = 1 (mass)
* We compute k (spring constant) and c (damping coefficient) from dampingRatio and w0


 */

const WebARRocksLMStabilizer = (function(){
  function allocate_pointsList(n){
    const r = new Array(n);
    for (let i=0; i<n; ++i){
      r[i] = [0, 0];
    }
    return r;
  }

  function reset_vec2List(pts){
    pts.forEach(reset_vec2);
  }

  function reset_vec2(pos){
    pos[0] = 0, pos[1] = 0;
  }

  function copy_vec2(src, dst){
    dst[0] = src[0], dst[1] = src[1];
  }

  function add_vec2(add, r){
    r[0] += add[0], r[1] += add[1];
  }

  function fma_vec2(v, a, k){
    v[0] += k*a[0], v[1] += k*a[1];
  }

  function sub_vec2(sub, r){
    r[0] -= sub[0], r[1] -= sub[1];
  }

  function scale_vec2(pos, sx, sy){
    pos[0] *= sx, pos[1] *= sy;
  }

  function variance_vec2(pos, mean, variance){
    const dx = pos[0] - mean[0], dy = pos[1] - mean[1];
    variance[0] = dx*dx, variance[1] = dy*dy;
  }

  function sqrt_vec2(pos){
    pos[0] = Math.sqrt(pos[0]), pos[1] = Math.sqrt(pos[1]);
  }

  function mix_vec2(u, v, t, r){
    r[0] = u[0] * (1-t) + v[0] * t,
    r[1] = u[1] * (1-t) + v[1] * t;
  }

  function copy_vec2List(src, dst){
    const n = src.length;
    for (let i=0; i<n; ++i){
      copy_vec2(src[i], dst[i]);
    }
  }

  function distance(u, v){
    const dx = u[0] - v[0], dy = u[1] - v[1];
    return Math.sqrt(dx*dx + dy*dy);
  }

  function size(u){
    return Math.sqrt(u[0]*u[0] + u[1]*u[1]);
  }

  const superThat = {
    instance: function(spec){

      const _spec = Object.assign({
        dampingRatio: 0.6, // 1 -> critically damped, >1 -> overdamped
        freq0: 5, // filtering frequency in hertz
        estimateFreq: true, // dynamically estimates filtering frequency in a crappy way. 
        estimateFreqFactor: 0.07,
        dtMax: 0.3, // in seconds   
        nSimulationLoops: 3, // number of simulation loops
        strengthStallThreshold: 2000, // disable stabilization is strength is > this value
        strengthStallThresholdHysteresis: 1000
      }, spec);

      const _dims = {
        widthPx: -1,
        heightPx: -1
      };

      let _lmCount = -1, _counter = 0;
      let _lmsPx = null;
      let _lmsVelocities = null;
      let _lmsStabilized = null, _lmsStabilizedPx = null;
      let _isStalled = false;

      const _force = [0, 0], _posDiff = [0, 0];

      let _dt = -1, _lastTimestamp = -1;
      let _freq = _spec.freq0; // frequency
      
      const _dampingParams = {
        k: -1, // spring constant
        c: -1 // damping coefficient
      };

      const _timer = (typeof(performance) === 'undefined') ? Date : performance;

      function allocate(lmCount){
        _lmCount = lmCount;
        
        _lmsPx = allocate_pointsList(lmCount);
        
        // physics:
        _lmsVelocities = allocate_pointsList(lmCount);
        
        // output:
        _lmsStabilizedPx = allocate_pointsList(lmCount);
        _lmsStabilized = allocate_pointsList(lmCount);

        that.reset();        
      }

      function compute_lmsPx(landmarks){
        for (let i=0; i<_lmCount; ++i){
          copy_vec2(landmarks[i], _lmsPx[i]);
          scale_vec2(_lmsPx[i], _dims.widthPx * 0.5, _dims.heightPx * 0.5);
        }
      }

      function update_freqEstimation(){
        const newFreq = _spec.estimateFreqFactor * 1 / _dt;
        const k = 0.1;
        _freq = k * newFreq + (1 - k) * _freq;
      }

      function compute_dampingParams(){
        const w0 = 2 * Math.PI * _freq;
        _dampingParams.k = w0 * w0;
        _dampingParams.c = 2 * _spec.dampingRatio * w0;
      }

      function compute_stabilized(){
        let _meanForce = 0;
        for (let i=0; i<_lmCount; ++i){
          const velocity = _lmsVelocities[i];
          const pos = _lmsStabilizedPx[i];

          const dt = _dt / _spec.nSimulationLoops;
          for (let j = 0; j<_spec.nSimulationLoops; ++j){
            // compute force applied on the point:
            reset_vec2(_force);
            
            // compute position difference:
            copy_vec2(pos, _posDiff);
            sub_vec2(_lmsPx[i], _posDiff);

            // add spring force:
            fma_vec2(_force, _posDiff, -_dampingParams.k);

            // add damping force:
            fma_vec2(_force, velocity, -_dampingParams.c);
          
            // accumulate forces
            // only for the first round:
            if (j === 0){
              _meanForce += size(_force);
            }

            const accl = _force; // because m = 1 (mass)
            
            // update velocity:
            fma_vec2(velocity, accl, dt);

            // update position:
            fma_vec2(pos, velocity, dt);

            copy_vec2(pos, _lmsStabilized[i]);          
          }
        } // end loop on landmarks


        // determine if we have stalled or not:
        _meanForce /= _lmCount;
        let isResetStabilization = false;
        if (!_isStalled && _meanForce > _spec.strengthStallThreshold + _spec.strengthStallThresholdHysteresis){
          _isStalled = true;
          console.log('INFO in WebARRocksLMStabilizer2: stalled!');
        } else if (_isStalled && _meanForce < _spec.strengthStallThreshold - _spec.strengthStallThresholdHysteresis){
          _isStalled = false;
          isResetStabilization = true;
          console.log('INFO in WebARRocksLMStabilizer2: unstalled!');
        } 


        for (let i=0; i<_lmCount; ++i){
          if (isResetStabilization){
            copy_vec2(_lmsPx[i], _lmsStabilized[i]);
            reset_vec2(_lmsVelocities[i]);
          }

          // convert from pixels to normalized viewport coordinates:
          scale_vec2(_lmsStabilized[i], 2 / _dims.widthPx, 2 / _dims.heightPx);
        }      
      }

      const that = {
        update: function(landmarks, widthPx, heightPx){
          // time in seconds
          const t = _timer.now() / 1000;

          // allocate if necessary:
          if (landmarks.length !== _lmCount){
            allocate(landmarks.length);
          }

          if (widthPx !== _dims.widthPx || heightPx !== _dims.heightPx){
            // if dimensions have changed, reset stabilization:
            _dims.widthPx = widthPx, _dims.heightPx = heightPx;
            that.reset();
          }

          // compute dt:
          _dt = (_lastTimestamp === -1) ? _spec.dtMax : t - _lastTimestamp;
          if (_dt > 1) {
            that.reset();
          }
          _dt = Math.min(_dt, _spec.dtMax);

          // compute landmarks positions in pixels:
          compute_lmsPx(landmarks);
          if (_counter === 0){
            copy_vec2List(_lmsPx, _lmsStabilizedPx);
          }

          // update frequency estimate
          if (_spec.estimateFreq){
            update_freqEstimation();
          }

          // compute spring and damping params:
          compute_dampingParams();
          
          // compute stabilized:
          compute_stabilized();

          _lastTimestamp = t;
          ++_counter;
          return (_isStalled ? landmarks : _lmsStabilized);
        },

        reset: function(){
          _counter = 0;
          _lastTimestamp = -1;
          _freq = _spec.freq0;
          if (_lmsVelocities !== null){
            reset_vec2List(_lmsVelocities);
          }
        }

      }
      return that;
    }
  }; //end that
  return superThat;
})();


// Export ES6 module:
try {
  module.exports = WebARRocksLMStabilizer;
} catch(e){
  console.log('ES6 Module not exported');
}
