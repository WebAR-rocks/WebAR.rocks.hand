import React, { useState, useRef, useEffect, Suspense } from 'react'

// import components:
import BackButton from '../components/BackButton.js'
import FlipCamButton from '../components/FlipCamButton.js'

// import neural network model:
//import NN_RP from '../contrib/WebARRocksHand/neuralNets/NN_NAV_RP_8.json'
//import NN_RB from '../contrib/WebARRocksHand/neuralNets/NN_NAV_RB_8.json'
import NN from '../contrib/WebARRocksHand/neuralNets/NN_NAV_19.json'

// This helper is not minified, feel free to customize it (and submit pull requests bro):
import navigationHelper from '../contrib/WebARRocksHand/helpers/HandTrackerNavigationHelper.js'



const compute_sizing = () => {
  // compute  size of the canvas:
  const height = window.innerHeight
  const width = window.innerWidth
  
  // compute position of the canvas:
  const top = 0
  const left = 0
  return {width, height, top, left}
}


const Navigation = () => {
  const [sizing, setSizing] = useState(compute_sizing())
  const [isSelfieCam, setIsSelfieCam] = useState(false)
  const [isInitialized] = useState(true)


  let _timerResize = null
  const handle_resize = () => {
    // do not resize too often:
    if (_timerResize){
      clearTimeout(_timerResize)
    }
    _timerResize = setTimeout(do_resize, 200)
  }


  const do_resize = () => {
    _timerResize = null
    const newSizing = compute_sizing()
    setSizing(newSizing)    
  }


  useEffect(() => {
    if (!_timerResize){
      navigationHelper.resize()
    }
  }, [sizing])


  const canvasVideoRef = useRef()
  const canvasPointerRef = useRef()
  const changeCameraButtonRef = useRef()

  useEffect(() => {
    // compute requested video resolution:
    const dpr = Math.min(2, (window.devicePixelRatio) ? window.devicePixelRatio : 1)
    let idealWidth = window.innerWidth*dpr, idealHeight = window.innerHeight*dpr
    const maxDim = Math.max(idealWidth, idealHeight)
    const scale = Math.min(1, 1024/maxDim)
    idealWidth = Math.round(idealWidth * scale), idealHeight = Math.round(idealHeight * scale)
    console.log('Requested video resolution: ', idealWidth, ' * ', idealHeight)

    navigationHelper.init({
      canvasVideo: canvasVideoRef.current,
      canvasPointer: canvasPointerRef.current,
      NNs: [NN],//[NN_RP, NN_RB],
      threshold: 0.95, // detection sensitivity, between 0 and 1
      videoSettings: {
        idealWidth: Math.max(idealHeight, idealWidth),
        idealHeight: Math.min(idealHeight, idealWidth)
      },
      callbackReady: (err, objs) => {
        if (err){
          console.log('INFO in Navigation.js: err = ', err)
          if (err === 'WEBCAM_UNAVAILABLE'){
            console.log('Camera unavailable')
          }
          return
        }

        // handle resizing / orientation change:
        window.addEventListener('resize', handle_resize)
        window.addEventListener('orientationchange', handle_resize)

        // correct a bug on iOS when the website is open in a new tab
        // (space between canvas and video on top of the page):
        navigationHelper.resize()

        // hide CHANGE CAMERA button for desktops:
        if (!objs.isMobileOrTablet){
          changeCameraButtonRef.current.style.display = 'none'
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

      onPointerDown: onPointerDown,
      onPointerUp: onPointerUp,
      onPointerMove: onPointerMove
    })

    return navigationHelper.destroy
  }, [isInitialized])


  const onPointerDown = (x, y) => {
    console.log('Pointer down at position: ', x, y)
  }


  const onPointerUp = (x, y) => {
    console.log('Pointer up at position: ', x, y)
  }


  const onPointerMove = (x, y, isDown) => {

  }

  
  const change_camera = () => {
    navigationHelper.change_camera()
  }


  // generate canvases:
  const mirrorClass = (isSelfieCam) ? 'mirrorX' : ''
     

  // pointer canvas and its container
  // should be above everything of the DOM, with pointer-event: none
  const canvasPointerContainerStyle = {
    position: 'fixed',
    zIndex: 10,
    top: 0, left: 0,
    pointerEvents: 'none'
  }
  const canvasPointerStyle = {
    position: 'fixed',
    zIndex: 10,
    top: 0, left: 0,
    pointerEvents: 'none'
  }

  // video canvas, behind everything of the DOM:
  const canvasVideoStyle = {
    position: 'fixed',
    zIndex: -1,
    top: 0, left: 0,
    pointerEvents: 'none'
  }    


  return (
    <div>
      <div style={canvasPointerContainerStyle}>
        <canvas className={mirrorClass} ref={canvasPointerRef}
              style={canvasPointerStyle} width = {sizing.width} height = {sizing.height} />
      </div>

      <canvas className={mirrorClass} ref={canvasVideoRef}
              style={canvasVideoStyle} width = {sizing.width} height = {sizing.height} />

      <BackButton />
      <FlipCamButton ref={changeCameraButtonRef} onClick={change_camera} />

    </div>
  )
} 


export default Navigation
