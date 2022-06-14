/**
 * 
 * Use OneEuroFilter to minimize jitter and lag when tracking landmarks
 * 
 * refs:
 *   * OneEuroFilter Details: http://www.lifl.fr/~casiez/1euro
 *   * See also this implementation: https://github.com/jaantollander/OneEuroFilter
 * 
 * properties:
 *   * minCutOff: decrease to minimize jitter
 *   * beta: increate to minimize lag
 *   * NNInputSizePx: size of the neural network input window in pixels
 */

function OneEuroFilter(spec){
  let _lastTime = -1;
  let _freq = spec.freq;
  
  const _x = filter_lowPass(compute_alpha(spec.minCutOff));
  const _dx = filter_lowPass(compute_alpha(spec.dcutoff));
  const _dtMin = 1.0 / spec.freqRange[1];

  function compute_alpha(cutoff){ // compute smoothing factor
    const te = 1.0 / _freq;  // = dt
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }
  
  this.filter = function(v, timestamp){
    if(_lastTime !== -1){
      const dt = Math.max(_dtMin, timestamp - _lastTime);
      _freq = 1.0 / dt;
      // clamp freq:
      _freq = Math.min(Math.max(_freq, spec.freqRange[0]), spec.freqRange[1]);
    }
    _lastTime = timestamp;
    const dvalue = _x.has_lastRawValue() ? (v - _x.get_lastRawValue()) * _freq : 0.0;
    const edvalue = _dx.filter_withAlpha(dvalue, compute_alpha(spec.dcutoff));
    const cutoff = spec.minCutOff + spec.beta * Math.abs(edvalue);
    return _x.filter_withAlpha(v, compute_alpha(cutoff));
  }

  this.reset = function(){
    _freq = spec.freq;
    _lastTime = -1;
    _x.reset();
    _dx.reset();
  }

  this.force = function(v){
    _x.force(v);
  }
}


function filter_lowPass(alpha, y0){
  let _y = y0 || 0.0;
  let _s = _y;
  let _isFirstTime = true;
  
  function filter(v){
    _y = v;
    if (_isFirstTime){
      _s = v;
      _isFirstTime = false;
    } else {
      _s = alpha * v + (1.0 - alpha) * _s;
    }
    return _s;
  }

  const that = {  
    filter_withAlpha: function(v, a){
      alpha = a;
      return filter(v);
    },
    
    has_lastRawValue: function(){
      return !_isFirstTime;
    },
    
    get_lastRawValue: function(){
      return _y;
    },

    reset: function(){
      _isFirstTime = true;
      _y = y0 || 0.0;
      _s = _y;
    },

    force: function(v){
      _y = v;
      _s = v;
    }
  }
  
  return that;
}


function compute_distanceNNInput(v, vStab, NNInputSizePx, scale){
  return 0.5 * NNInputSizePx * Math.abs(v - vStab) / scale;
}


function clamp(x, min, max){
  return Math.min(Math.max(x, min), max);
}


function smoothStep(edges, x){
  const t = clamp((x - edges[0]) / (edges[1] - edges[0]), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}


function mix(x, y, t){
  return x*(1.0-t) + y*t;
}


const WebARRocksLMStabilizer = (function(){
  const superThat = {
    instance: function(spec){
      const defaultSpec = {
        // One Euro filter settings:
        freq: 30,
        freqRange: [12, 144],
        minCutOff: 0.001,
        beta: 50,
        dcutoff: 1.0,

        // WebAR.rocks enhancement
        NNInputSizePx: 128,
        forceFilterNNInputPxRange: [0.8, 2]
      };
      const _spec = Object.assign({}, defaultSpec, spec);
      const _filters = [];
      const _stabilizedLM = [];
      const _timer = (typeof(performance) === 'undefined') ? Date : performance;

      const that = {
        update: function(landmarks, widthPx, heightPx, scale){
          const LMCount = landmarks.length;

          // Filters length should be landmarks length * 2 (x,y):
          while (_filters.length < LMCount*2) {
            const filter = new OneEuroFilter(_spec);
            _filters.push(filter);
          }

          // init stabilizedLM array if necessary:
          if (_stabilizedLM.length !== LMCount){
            _stabilizedLM.splice(0);
            for (let i=0; i<LMCount; ++i){
              _stabilizedLM.push([0.0, 0.0]);
            }
          }

          const aspectRatio = widthPx / heightPx;

          // Stabilize each lm with one euro filter
          const timestamp = _timer.now() / 1000.0;
          for (let i=0; i<LMCount; ++i) {
            const x = landmarks[i][0];
            const y = landmarks[i][1];

            let xStab = _filters[i*2].filter(x, timestamp);
            let yStab = _filters[i*2 + 1].filter(y, timestamp);
            
            // this step is NOT included in OneEuroLMStabilizer.
            // We individually reset the filter if the distance between stabilized and unstabilized landmarks
            // is above a fixed threshold. This distance is computed in neural net input pixels
            // the goal is to avoid that the filter increased latency too much, which is really bad for face expressions
            const dx = compute_distanceNNInput(x, xStab, _spec.NNInputSizePx, scale);
            const dy = compute_distanceNNInput(y, yStab, _spec.NNInputSizePx, scale * aspectRatio);
            const dMax = Math.max(dx, dy);
            if (dMax > _spec.forceFilterNNInputPxRange[0]){
              const k = smoothStep(_spec.forceFilterNNInputPxRange, dMax);
              xStab = mix(xStab, x, k);
              yStab = mix(yStab, y, k);
              _filters[i*2].force(xStab);
              _filters[i*2 + 1].force(yStab);
            }

            // affect output:
            _stabilizedLM[i][0] = xStab;
            _stabilizedLM[i][1] = yStab;
          }

          return _stabilizedLM;
        },


        reset: function() {
          _filters.forEach( filter => { filter.reset() });
        }
      }

      return that;
    }
  }
  return superThat;
})();


// Export ES6 module:
try {
  module.exports = WebARRocksLMStabilizer;
} catch(e){
  console.log('ES6 Module not exported');
}
