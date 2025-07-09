# WebAR.rocks.hand React Three Fiber Demos


## Presentation

This directory is fully standalone, that's why it is not in the [/demos](/demos) path like other demonstrations.


## Quick start

To test it, run from this path:

```bash
# facultative: use Node >= 22:
nvm use 22
#
npm install
npm run dev -- --host
```

Then open https://localhost:5173/ in your web browser.


## Production build

```bash
npm run build
```


## Dev notes

THREE.js is used through [Three Fiber](https://github.com/pmndrs/react-three-fiber).
We also use:
* [react-postprocessing](https://github.com/pmndrs/react-postprocessing)

Only the best demos have been ported to this development environment.

The main script and neural network models have been copied to [src/js/contrib/WebARRocksHand/dist](src/js/contrib/WebARRocksHand/dist) and [src/js/contrib/WebARRocksHand/neuralNets](src/js/contrib/WebARRocksHand/neuralNets).

The helpers have been modified compared to the static ones. They are in [src/js/contrib/WebARRocksHand/helpers](src/js/contrib/WebARRocksHand/helpers)