import React from 'react';

export default function SettingsPage() {
  return (
    <main className="launcher-main">
      <section className="login-section">
        <div className="login-card">
          <h2 className="section-title">SETTINGS</h2>
          <div className="field">
            <label className="field-label" htmlFor="graphics-quality">
              <span>Graphics Quality</span>
              <select id="graphics-quality" defaultValue="high">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="enable-fullscreen">
              <input id="enable-fullscreen" type="checkbox" defaultChecked />
              <span>Enable Fullscreen</span>
            </label>
          </div>
          <button type="button" className="play-btn">
            SAVE
          </button>
        </div>
      </section>
    </main>
  );
}
