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

This stabilizer records a floating window of spec.n latest positions
And then compute velocities and acceleration to do an estimation.

It is quite a mess.
 */
const WebARRocksLMStabilizer = (function(){
  function allocate_pointsList(n){
    const r = new Array(n);
    for (let i=0; i<n; ++i){
      r[i] = [0, 0];
    }
    return r;
  }

  function allocate_pointsLists(m, n){
    const r = new Array(m);
    for (let i=0; i<m; ++i){
      r[i] = allocate_pointsList(n);
    }
    return r;
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

  function copy_vec2s(src, dst){
    const n = src.length;
    for (let i=0; i<n; ++i){
      copy_vec2(src[i], dst[i]);
    }
  }

  function distance(u, v){
    const dx = u[0] - v[0], dy = u[1] - v[1];
    return Math.sqrt(dx*dx + dy*dy);
  }

  function clamp(x, minVal, maxVal){
    return Math.min(Math.max(x, minVal), maxVal);
  }

  function smoothStep(edge0, edge1, x){
    const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  function compute_means(lastPositions, means){
    const n = means.length;
    const m = lastPositions.length;

    lastPositions.forEach(function(positions, ind){
      for (let i=0; i<n; ++i){
        if (ind === 0){
          copy_vec2(positions[i], means[i]);
        } else {
          add_vec2(positions[i], means[i])
        }
        if (ind === m-1){
          scale_vec2(means[i], 1/m, 1/m);
        }
      }
    });
  }

  function compute_sigmas(cursor, lastPositions, lastPredicted, sigmas){
    const n = sigmas.length;
    const m = lastPositions.length;

    for (let lmi = 0; lmi < n; ++lmi){ // loop over landmarks
      const sigma = sigmas[lmi];
      reset_vec2(sigma);

      for (let i = 0; i<m - 1; ++i){ // loop over records (dot not take account of current record)
        const c = (m + cursor - 1 - i) % m;
        const pos = lastPositions[c][lmi];
        const posPredicted = lastPredicted[c][lmi];
        const dx = pos[0] - posPredicted[0];
        const dy = pos[1] - posPredicted[1];
        sigma[0] += dx*dx;
        sigma[1] += dy*dy;
      }

      scale_vec2(sigma, 1/(m-1), 1/(m-1));
      sqrt_vec2(sigma);      
    }    
  }

  function compute_velocities(cursor, lastPositions, lastTimestamps, velocities){
    const n = velocities.length;
    const m = lastPositions.length;

    const firstCursor = (cursor + 1) % m;
    const dt = lastTimestamps[cursor] - lastTimestamps[firstCursor];

    for (let lmi=0; lmi<n; ++lmi){ // for each landmark
      const currentPosition = lastPositions[cursor][lmi];
      const firstCursor = (cursor + 1) % m;
      const firstPosition = lastPositions[firstCursor][lmi];

      // compute velocity using Euler approx:
      const velocity = velocities[lmi];
      copy_vec2(currentPosition, velocity);
      sub_vec2(firstPosition, velocity);
      scale_vec2(velocity, 1/dt, 1/dt);
    }
  }

  function compute_accelerations(cursor, lastPositions, lastTimestamps, accelerations){
    const n = accelerations.length;
    const m = lastPositions.length;

    for (let lmi=0; lmi<n; ++lmi){ // for each landmark
      const currentPosition = lastPositions[cursor][lmi];
      const currentTimestamp = lastTimestamps[cursor];

      const firstCursor = (cursor + 1) % m;
      const firstPosition = lastPositions[firstCursor][lmi];
      const firstTimestamp = lastTimestamps[firstCursor];

      const middleCursor = (cursor + (m - 1) / 2) % m;
      const middlePosition = lastPositions[middleCursor][lmi];
      const middleTimestamp = lastTimestamps[middleCursor];

      // compute 2 velocities:
      const dt0 = middleTimestamp - firstTimestamp;
      const v0x = (middlePosition[0] - firstPosition[0]) / dt0;
      const v0y = (middlePosition[1] - firstPosition[1]) / dt0;

      const dt1 = currentTimestamp - middleTimestamp;
      const v1x = (currentPosition[0] - middlePosition[0]) / dt1;
      const v1y = (currentPosition[1] - middlePosition[1]) / dt1;

      // compute acceleraction
      const acceleration = accelerations[lmi]; 
      const dta = (currentTimestamp - firstTimestamp) / 2;
      acceleration[0] = (v1x - v0x) / dta;
      acceleration[1] = (v1y - v0y) / dta;
    }
  }  

  function leak_mean(predicteds, means, leak){
    const n = predicteds.length;

    for (let lmi=0; lmi<n; ++lmi){ // for each landmark
      mix_vec2(predicteds[lmi], means[lmi], leak, predicteds[lmi]);
    }    
  }

  function update_predictionWithPhysics(predicteds, velocities, accelerations, dt){
    const n = predicteds.length;

    for (let lmi=0; lmi<n; ++lmi){ // for each landmark
      const predicted = predicteds[lmi];
      
      fma_vec2(predicted, velocities[lmi], dt);
      fma_vec2(predicted, accelerations[lmi], 0.5 * dt * dt);
    }     
  }

  const superThat = {
    instance: function(spec){
      const _spec = Object.assign({
        n: 7,
        leakMean: 0.1,
        antiJitteringDistancePx: 6,
        sigmaThresholdFactor: 5
      }, spec);

      if (_spec.n % 2 === 0){
        ++_spec.n;
      }

      let _lmCount = -1;
      let _counter = 0;
      let _cursor = 0;
      
      const _dims = {
        widthPx: -1,
        heightPx: -1
      };

      let _lastTimestamps = null, _lastPositionsPx = null;
      let _lmsPx = null;
      let _lastPredicteds = null;
      let _lmsMeanPx = null, _lmsSigmaPx = null;
      let _lmsVelocities = null, _lmsAccelerations = null;
      let _lmsPredictedPx = null, _lmsStabilized = null, _lmsStabilizedPx = null;

      const _timer = (typeof(performance) === 'undefined') ? Date : performance;

      function allocate(lmCount){
        that.reset();
        _lmCount = lmCount;
        
        _lastPositionsPx = allocate_pointsLists(_spec.n, lmCount);
        _lastPredicteds = allocate_pointsLists(_spec.n, lmCount);
        _lastTimestamps = new Float64Array(_spec.n);
        
        _lmsPx = allocate_pointsList(lmCount);
        
        // physics:
        _lmsVelocities = allocate_pointsList(lmCount);
        _lmsAccelerations = allocate_pointsList(lmCount);
        _lmsPredictedPx = allocate_pointsList(lmCount);

        // stats:
        _lmsMeanPx = allocate_pointsList(lmCount);
        _lmsSigmaPx = allocate_pointsList(lmCount);

        _lmsStabilizedPx = allocate_pointsList(lmCount);
        _lmsStabilized = allocate_pointsList(lmCount);
      }

      function compute_lmsPx(landmarks){
        for (let i=0; i<_lmCount; ++i){
          copy_vec2(landmarks[i], _lmsPx[i]);
          scale_vec2(_lmsPx[i], _dims.widthPx * 0.5, _dims.heightPx * 0.5);
        }
      }

      function save(lmsPx){
        const t = _timer.now() / 1000; // timestamp in seconds
        _lastTimestamps[_cursor] = t;
        const cursorPrev = (_cursor === 0) ? _spec.n - 1 : _cursor - 1;
        const tPrev = (_counter === 0) ? t : _lastTimestamps[cursorPrev];
        const dt = t - tPrev;
        
        for (let i=0; i<_lmCount; ++i){
          copy_vec2(lmsPx[i], _lastPositionsPx[_cursor][i]);
        }
      }

      function update_cursor(){
        _cursor = (_cursor + 1) % _spec.n;
      }

      function compute_stabilized(){
        let kSum = 0;
        for (let i=0; i<_lmCount; ++i){

          const posPx = _lmsPx[i];
          const sigma = _lmsSigmaPx[i];
          const predictedPx = _lmsPredictedPx[i];

          // compute diff between position and predicted position:
          const dx = posPx[0] - predictedPx[0];
          const dy = posPx[1] - predictedPx[1];

          // k is the stabilization coefficient, between 0 and 1
          // if k=1, stabilization is full. stabilized = predicted
          // if k=0, there is no stabilization: stabilized = pos
          // we use standard deviation to determine whether there is a sudden move
          // and if there is a sudden move, we disable stabilization
          // compute k:
          let sxThres = _spec.sigmaThresholdFactor * sigma[0];
          let syThres = _spec.sigmaThresholdFactor * sigma[1];

          // threshold should be at least 1 pixel
          sxThres = Math.max(1, sxThres);
          syThres = Math.max(1, syThres);

          const kx = smoothStep(0.5 * sxThres, 1.5 * sxThres, dx);
          const ky = smoothStep(0.5 * syThres, 1.5 * syThres, dy);
          const k = (1-kx) * (1-ky);
          
          kSum += k;

          mix_vec2(posPx, predictedPx, k, predictedPx);
         
          // compute anti-jittering coefficient, q
          // if q = 0, predicted is close enought to stabilized and we do not update the position
          // if q = 1, we fully update the position
          const d = distance(predictedPx, _lmsStabilizedPx[i]);
          const q = smoothStep(0, _spec.antiJitteringDistancePx, d);
          const stabilizedPx = _lmsStabilizedPx[i];

          mix_vec2(stabilizedPx, predictedPx, q, stabilizedPx);
          
          // convert from pixels to normalized viewport coordinates:
          copy_vec2(_lmsStabilizedPx[i], _lmsStabilized[i]);
          scale_vec2(_lmsStabilized[i], 2 / _dims.widthPx, 2 / _dims.heightPx);
        }
        if (kSum < _lmCount * 0.5){
          that.reset();
        }
      }

      const that = {
        update: function(landmarks, widthPx, heightPx){
          // allocate if necessary:
          if (landmarks.length !== _lmCount){
            allocate(landmarks.length);
          }

          if (widthPx !== _dims.widthPx || heightPx !== _dims.heightPx){
            // if dimensions have changed, reset stabilization:
            _dims.widthPx = widthPx, _dims.heightPx = heightPx;
            that.reset();
          }

          // compute landmarks positions in pixels:
          compute_lmsPx(landmarks);
          save(_lmsPx);

          if (++_counter < _spec.n){
            // not enough data yet to stabilize:
            update_cursor();
            return landmarks;
          }

          const cursorPrev = (_cursor - 1 + _spec.n) % _spec.n;
          const lastDt = _lastTimestamps[_cursor] - _lastTimestamps[cursorPrev];
          if (lastDt > 1){
            that.reset();
          }

          // compute velocities in pixels per second:
          compute_velocities(_cursor, _lastPositionsPx, _lastTimestamps, _lmsVelocities);

          if (_counter === _spec.n){
            copy_vec2s(_lmsPx, _lmsPredictedPx);
            copy_vec2s(_lmsPredictedPx, _lastPredicteds[_cursor]);
          }

          // compute accelerations in pixels per second^2
          compute_accelerations(_cursor, _lastPositionsPx, _lastTimestamps, _lmsAccelerations);

          // compute mean:
          compute_means(_lastPositionsPx, _lmsMeanPx);

          // leak mean to predicted to avoid prediction errors
          leak_mean(_lmsPredictedPx, _lmsMeanPx, _spec.leakMean);

          // predict positions from physics:
          update_predictionWithPhysics(_lmsPredictedPx, _lmsVelocities, _lmsAccelerations, lastDt);
          //copy_vec2s(_lmsPredictedPx, _lastPredicteds[_cursor]);

          // compute sigmas (standard deviations):
          compute_sigmas(_cursor, _lastPositionsPx, _lastPredicteds, _lmsSigmaPx);
          
          // compute stabilized from predicted
          compute_stabilized();

          copy_vec2s(_lmsPredictedPx, _lastPredicteds[_cursor]);
          
          update_cursor();
          return _lmsStabilized;
        },

        reset: function(){
          _counter = 0;
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
