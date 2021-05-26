import React from 'react'
import { render } from 'react-dom'
import { AppContainer } from 'react-hot-loader'
import { Switch, Route, BrowserRouter as Router } from 'react-router-dom'

import './styles/index.scss'

import DemosMenu from './js/components/DemosMenu'

import DemoObjectManip from './js/demos/ObjectManip.js'
import DemoBareFootVTO from './js/demos/BareFootVTO.js'
import DemoNavigation from './js/demos/Navigation.js'
import DemoVTO from './js/demos/VTO.js'

render(
  <AppContainer>
    <Router>
      <Switch>

        <Route path="/objectManip">
          <DemoObjectManip />
        </Route>

        <Route path="/bareFootVTO">
          <DemoBareFootVTO />
        </Route>

        <Route path="/navigation">
          <DemoNavigation />
        </Route>

        <Route path="/VTO">
          <DemoVTO />
        </Route>

        <Route path="/">
          <DemosMenu />
        </Route>

      </Switch>
    </Router>
  </AppContainer>,
  document.querySelector('#root')
);