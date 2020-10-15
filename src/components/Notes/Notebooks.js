import React, { Component } from 'react'
import Notebook from './Notebook'
import Note from './Note'

const isString = require('is-string')

const { fetchCred, j } = require('../../config/config')

function secondsToHms(d) {
  d = Number(d)
  var h = Math.floor(d / 3600)
  var m = Math.floor((d % 3600) / 60)
  var s = Math.floor((d % 3600) % 60)

  var hDisplay = h > 0 ? h + (h === 1 ? ' hour, ' : ' hours, ') : ''
  var mDisplay = m > 0 ? m + (m === 1 ? ' minute, ' : ' minutes, ') : ''
  var sDisplay = s > 0 ? s + (s === 1 ? ' second' : ' seconds') : ''
  return hDisplay + mDisplay + sDisplay
}

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min

export default class Notebooks extends Component {
  constructor(props) {
    super(props)
    this.state = {
      notebooks: '',
      notebookGuid: null
    }
  }

  async componentDidMount() {
    var response, notebooks

    try {
      response = await fetch('/notebooks', fetchCred)
      if (response) {
        notebooks = await response.json()
      }
      if (notebooks) {
        this.setState({
          notebooks: notebooks,
          notebookGuid:
            this.state.notebookGuid ||
            notebooks[randomInt(0, notebooks.length)].guid
        })
      }
    } catch (err) {
      console.log(
        `Notebooks fetch error ${j(err)}, response ${j(
          response
        )}, notebooks ${j(notebooks)}`
      )
      if (notebooks && notebooks.rateLimitDuration)
        this.setState({
          notebooks: `Evernote has rate limited us. Try again in ${secondsToHms(
            notebooks.rateLimitDuration
          )}.`
        })
      else if (notebooks && notebooks.length > 0)
        this.setState({
          notebooks: notebooks,
          notebookGuid:
            this.state.notebookGuid ||
            notebooks[randomInt(0, notebooks.length)].guid
        })
      else
        this.setState({
          notebooks:
            'Evernote connection failed. Please logout and try logging in again.'
        })
    }
  }

  notebookChanged = notebookGuid => {
    this.setState({ notebookGuid })
  }

  renderNotebooks = () => {
    if (!this.props.notebooksActive || !this.props.loggedIn) return
    return (
      <div className="Filter">
        <p className="m-l1 c-text-light">
          Filter random notes based on a notebook:
        </p>
        {this.renderNotebooksContent(this.state.notebooks)}
      </div>
    )
  }

  renderNotebooksContent = notebooks =>
    isString(notebooks) ? (
      <span>{notebooks}</span>
    ) : (
      notebooks.map(notebook => this.renderNotebook(notebook))
    )

  renderNotebook = notebook => (
    <Notebook
      name={notebook.name}
      key={notebook.name + notebook.guid}
      guid={notebook.guid}
      notebookChanged={this.notebookChanged}
    />
  )

  render() {
    return (
      <div>
        {this.renderNotebooks()}
        <main role="main">
          <Note notebookGuid={this.state.notebookGuid} />
        </main>
      </div>
    )
  }
}
