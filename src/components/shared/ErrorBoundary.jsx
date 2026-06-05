import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(err) {
    return { error: err }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <div className="error-message" style={{ fontSize: 14 }}>
            <strong>Something went wrong on this page.</strong>
            <br />
            <code style={{ fontSize: 12 }}>{this.state.error.message}</code>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}
            onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
