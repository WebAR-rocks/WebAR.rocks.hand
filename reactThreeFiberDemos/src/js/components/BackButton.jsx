import React from 'react'
import { Link } from 'react-router-dom'

export default function BackButton(props) {
  return (
    <div className='BackButton'>
      <Link to='/'>BACK</Link>
    </div>
  )
}