import React, { Component } from 'react'
import { Link } from 'react-router-dom'
import classnames from 'classnames'
import './style.css'
import IconRandom from '../ui/IconRandom.js'
import IconFilter from '../ui/IconFilter.js'
import IconPerson from '../ui/IconPerson.js'
import IconInfo from '../ui/IconInfo.js'

export default class Header extends Component {
  render() {
    const loginLink = this.props.loggedIn ? 'authout' : 'auth'
    const loginText = this.props.loggedIn ? 'Logout' : 'Login'

    return (
      <header className="Header" role="banner">
        <div className="f f-justifyBetween">
          <div className="App-logo f f-alignSelfCenter">
            <a onClick={this.props.noteReload}>
              <IconRandom />
                                        
            </a>
          </div>
          <div className="f Header-buttons">
            <div>
              <Link to={loginLink}>
                <button>
                  <IconPerson />
                  {loginText}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>
    )
  }
}
