import React from 'react'
import { Link } from 'react-router-dom'

export default function DemoMenu(props) {
  return (
    <div className='demoMenusContent'>
      <h1>Demos Menu</h1>
      <ul>
        <li><Link to='/objectManip'>3D Object Manipulation</Link></li>
        <li><Link to='/navigation'>Hand based navigation</Link></li>
        <li><Link to='/VTO'>Wrist and ring VTO</Link></li>
        <li><Link to='/bareFootVTO'>Bare foot VTO</Link></li>
      </ul> 
    </div>
  )
}