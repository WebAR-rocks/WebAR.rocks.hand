import React from 'react'

export default React.forwardRef((props, ref) => {
  return (
    <div ref={ref} onClick={props.onClick} className='FlipCamButton'>
       Flip Camera
    </div>
  )
})