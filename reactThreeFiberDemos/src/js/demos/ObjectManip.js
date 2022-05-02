import React, { useState, useRef, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber'
import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Clock,
  sRGBEncoding
} from 'three'
// import GLTF loader - originally in examples/jsm/loaders/
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// import components:
import BackButton from '../components/BackButton.js'
import FlipCamButton from '../components/FlipCamButton.js'

// import neural network model:
import NN from '../contrib/WebARRocksHand/neuralNets/NN_OBJMANIP_7.json'

// This helper is not minified, feel free to customize it (and submit pull requests bro):
import VTOThreeHelper from '../contrib/WebARRocksHand/helpers/HandTrackerThreeHelper.js'

//import PoseFlipFilter
import PoseFlipFilter from '../contrib/WebARRocksHand/helpers/PoseFlipFilter.js'

// ASSETS:
// import 3D models of velociraptor:
import GLTFModel from '../../assets/objectManip/velociraptor.glb'



let _threeAnimationMixer = null

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

  // init velociraptor animation:
  const animationClip = gltf.animations[0]
  _threeAnimationMixer = new AnimationMixer(model)
  const animationAction = _threeAnimationMixer.clipAction( animationClip )
  animationAction.play()
  
  // get scale, position and quaternion
  // and convert from Blender => THREE
  const s = props.pose.scale
  const t = props.pose.translation
  const q = props.pose.quaternion

  return (
    <object3D ref={objRef}>
      <object3D>
        <object3D position={[t[0], t[2], -t[1]]}
                  scale={[s,s,s]}
                  quaternion={[q[0], q[2], -q[1], q[3]]} >
          <primitive object={model} />
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


const ObjectManip = () => {
  const [sizing, setSizing] = useState(compute_sizing())
  const [isSelfieCam, setIsSelfieCam] = useState(false)
  const [isInitialized] = useState(true)
 

  const _pose = {
      scale: 6.5, 
      translation: [0, -6.73, -1.68],
      quaternion: [0.993, 0, 0, 0.11] // X,Y,Z,W
    }
  const _GLTFModel = GLTFModel
  let _timerResize = null
  const _threeClock = new Clock()

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
      VTOThreeHelper.resize()
    }
  }, [sizing])  


  const canvasVideoRef = useRef()
  useEffect(() => {
    // init WEBARROCKSHAND through the helper:

    VTOThreeHelper.init({
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
      threshold: 0.7, // detection sensitivity, between 0 and 1
      handTrackerCanvas: canvasVideoRef.current,
      debugDisplayLandmarks: false, // true to display landmarks
      NNs: [ NN ],
      stabilizationSettings: {
        NNSwitchMask: {
          isRightHand: false
        }
      },
      callbackTrack: animate_model
    }).then(() => {
      console.log('VTOThreeHelper is ready')

      // handle resizing / orientation change:
      window.addEventListener('resize', handle_resize)
      window.addEventListener('orientationchange', handle_resize)
    })

    return () => {
      _threeAnimationMixer = null
      return VTOThreeHelper.destroy()
    }
  }, [isInitialized])

 
  const animate_model = () => {
    if (_threeAnimationMixer){
      _threeAnimationMixer.update(_threeClock.getDelta() * 0.5)
    }
  }

  
  const flip_camera = () => {
    VTOThreeHelper.update_videoSettings({
      facingMode: (isSelfieCam) ? 'environment' : 'user'
    }).then(() => {
      setIsSelfieCam(!isSelfieCam)
    }).catch((err) => {
      console.log('ERROR: Cannot flip camera -', err)
    })
  }

  
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
          <VTOModelContainer GLTFModel={_GLTFModel} pose={_pose} />
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


export default ObjectManip
