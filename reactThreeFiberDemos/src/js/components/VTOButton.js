import React from 'react'
import { Link } from 'react-router-dom'

export default React.forwardRef((props, ref) => {
  return (
    <div ref={ref} onClick={props.onClick} className='VTOButton'>
       {props.children}
    </div>
  )
})