import { render } from 'react-dom'
import { Routes, Route, BrowserRouter as Router } from 'react-router-dom'

//import './index.css'

import DemosMenu from './js/components/DemosMenu'

import DemoObjectManip from './js/demos/ObjectManip'
import DemoBareFootVTO from './js/demos/BareFootVTO'
import DemoNavigation from './js/demos/Navigation'
import DemoVTO from './js/demos/VTO'


export default function App(props){
  return (
    <Router>
      <Routes>
        <Route path="/objectManip" element={<DemoObjectManip />} />
        <Route path="/bareFootVTO" element={<DemoBareFootVTO />} />
        <Route path="/navigation" element={<DemoNavigation />} />
        <Route path="/VTO" element={<DemoVTO />} />
        <Route path="/" element={<DemosMenu />} />
      </Routes>
    </Router>
  )
}