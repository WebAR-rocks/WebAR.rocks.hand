import React, { useState, useEffect, useRef, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import {
  ACESFilmicToneMapping,
  sRGBEncoding
} from 'three'
// import GLTF loader - originally in examples/jsm/loaders/
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// import components:
import BackButton from '../components/BackButton.js'
import FlipCamButton from '../components/FlipCamButton.js'

// import neural network model:
import NN from '../contrib/WebARRocksHand/neuralNets/NN_BAREFOOT_3.json'

// This helper is not minified, feel free to customize it (and submit pull requests bro):
import VTOThreeHelper from '../contrib/WebARRocksHand/helpers/HandTrackerThreeHelper.js'

//import PoseFlipFilter
import PoseFlipFilter from '../contrib/WebARRocksHand/helpers/PoseFlipFilter.js'

// ASSETS:
// import 3D models of a right shoe:
import GLTFModel from '../../assets/bareFootVTO/ballerinaShoe.glb'

import GLTFOccluderModel from '../../assets/bareFootVTO/occluder.glb'




// fake component, display nothing
// just used to get the Camera and the renderer used by React-fiber:
const ThreeGrabber = (props) => {
  const threeFiber = useThree()

  // tweak encoding:
  const threeRenderer = threeFiber.gl
  threeRenderer.toneMapping = ACESFilmicToneMapping
  threeRenderer.outputEncoding = sRGBEncoding

  useFrame(VTOThreeHelper.update_threeCamera.bind(null, props.sizing, threeFiber.camera))
  
  return null
}


const compute_sizing = () => {
  // compute  size of the canvas:
  const height = window.innerHeight
  const wWidth = window.innerWidth
  const width = Math.min(wWidth, height)

  // compute position of the canvas:
  const top = 0
  const left = (wWidth - width ) / 2
  return {width, height, top, left}
}


const VTOModelContainer = (props) => {
  const objRef = useRef()
  useEffect(() => {
    const threeObject3DParent = objRef.current
    const threeObject3D = threeObject3DParent.children[0]
    VTOThreeHelper.set_handRightFollower(threeObject3DParent, threeObject3D)
  })
  
  // import main model:
  const gltf = useLoader(GLTFLoader, props.GLTFModel)
  const model = gltf.scene

  // import occluder:
  const gltfOccluder = useLoader(GLTFLoader, props.GLTFOccluderModel)
  const occluderModel = gltfOccluder.scene.clone()
  
  // get scale, position and quaternion
  const s = props.pose.scale
  
  return (
    <object3D ref={objRef}>
      <object3D>
        <object3D position={props.pose.translation}
                  scale={[s,s,s]} >
          <primitive object={model} />
          <primitive object={occluderModel} userData={{isOccluder: true}}/>
        </object3D>
      </object3D>
    </object3D>
    )
}


const DebugCube = (props) => {
  const s = props.size || 1
  return (
    <mesh name="debugCube">
      <boxBufferGeometry args={[s, s, s]} />
      <meshNormalMaterial />
    </mesh>
    )
}


const BareFootVTO = () => {
  const [sizing, setSizing] = useState(compute_sizing())
  const [isSelfieCam, setIsSelfieCam] = useState(false)
  const [isInitialized] = useState(true)
  
  const _pose = {
    scale: 1.2, 
    translation: [0, 0.01, -0.02] // Z -> verical
  }
  const _GLTFModel = GLTFModel
  const _GLTFOccluderModel = GLTFOccluderModel


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
    //VTOThreeHelper.clear_threeObjects()
    setSizing(newSizing)
  }


  useEffect(() => {
    if (!_timerResize) {
      VTOThreeHelper.resize()
    }
  }, [sizing])


  useEffect(() => {
    // init WEBARROCKSHAND through the helper:
    VTOThreeHelper.init({
      poseLandmarksLabels: [
        'ankleBack', 'ankleOut', 'ankleIn', 'ankleFront',
        'heelBackOut', 'heelBackIn',
        'pinkyToeBaseTop', 'middleToeBaseTop', 'bigToeBaseTop'
      ],
      poseFilter: PoseFlipFilter.instance({}),
      enableFlipObject: true,
      cameraZoom: 1,
      freeZRot: false,
      threshold: 0.6, // detection threshold, between 0 and 1. + -> harder detection but less false positive
      scanSettings: {
        /*translationScalingFactors: [0.3, 0.3, 1.0],
        multiDetectionSearchSlotsRate: 0.5,
        multiDetectionEqualizeSearchSlotScale: true, 
        multiDetectionForceSearchOnOtherSide: true //*/
        multiDetectionSearchSlotsRate: 0.5,
        multiDetectionMaxOverlap: 0.3,
        multiDetectionOverlapScaleXY: [0.5, 1],
        multiDetectionEqualizeSearchSlotScale: true, 
        multiDetectionForceSearchOnOtherSide: true,
        multiDetectionForceChirality: 1,
        disableIsRightHandNNEval: true,
        overlapFactors: [1.0, 1.0, 1.0],
        translationScalingFactors: [0.3, 0.3, 1.0],
        nScaleLevels: 2, // in the higher scale level, the size of the detection window is the smallest video dimension
        scale0Factor: 0.5
      },
      handTrackerCanvas: canvasVideoRef.current,
      debugDisplayLandmarks: false, // true to display landmarks
      NNs: [ NN ],
      maxHandsDetected: 2,
      stabilizationSettings: {
        NNSwitchMask: {
          /*isRightHand: true,
          isFlipped: false*/
          isRightHand: false,
          isFlipped: false
        }
      }
    })

    // handle resizing / orientation change:
    window.addEventListener('resize', handle_resize)
    window.addEventListener('orientationchange', handle_resize)

    return VTOThreeHelper.destroy
  }, [isInitialized])



  const flip_camera = () => {
    VTOThreeHelper.update_videoSettings({
      facingMode: (isSelfieCam) ? 'environment' : 'user'
    }).then(() => {
      setIsSelfieCam(!isSelfieCam)
    }).catch((err) => {
      console.log('ERROR: Cannot flip camera -', err)
    })
  }


  const canvasVideoRef = useRef()
  
  // generate canvases:
  const mirrorClass = (isSelfieCam) ? 'mirrorX' : ''
  return (
    <div>
      {/* Canvas managed by three fiber, for AR: */}
      <Canvas className={mirrorClass} style={{
        position: 'fixed',
        zIndex: 2,
        ...sizing
      }}
      gl={{
        preserveDrawingBuffer: true // allow image capture
      }}
      updateDefaultCamera = {false}
      >
        <ThreeGrabber sizing={sizing}/>
        
        <Suspense fallback={<DebugCube />}>
          <VTOModelContainer GLTFModel={_GLTFModel} GLTFOccluderModel={_GLTFOccluderModel} pose={_pose} />
        </Suspense>

        <pointLight color={0xffffff} intensity={1} />
        <ambientLight color={0xffffff} intensity={0.5} />
      </Canvas>

    {/* Canvas managed by WebAR.rocks, just displaying the video (and used for WebGL computations) */}
      <canvas className={mirrorClass} ref={canvasVideoRef} style={{
        position: 'fixed',
        zIndex: 1,
        ...sizing
      }} width = {sizing.width} height = {sizing.height} />

      <BackButton />
      <FlipCamButton onClick={flip_camera} />

    </div>
  )
  
} 

export default BareFootVTO
