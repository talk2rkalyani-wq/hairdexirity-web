import React from 'react'
import './AIHero.css'

export const AIHero: React.FC = () => {
  return (
    <section className="ai-hero-section" aria-label="Salon Assistant Hero">
      {/* Abstract decorative floral shape in top-right */}
      <div className="hero-decor-wrap" aria-hidden="true">
        <svg
          viewBox="0 0 420 420"
          className="hero-floral-svg"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="petal1" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1e1035" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="petal2" x1="100%" y1="20%" x2="0%" y2="80%">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.6" />
              <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#d946ef" stopOpacity="0.8" />
            </linearGradient>
            <linearGradient id="petal3" x1="100%" y1="0%" x2="20%" y2="100%">
              <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.7" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.75" />
            </linearGradient>
            <radialGradient id="centerGlow" cx="85%" cy="15%" r="70%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.28" />
              <stop offset="50%" stopColor="#6366f1" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#070a12" stopOpacity="0" />
            </radialGradient>
            <filter id="softPetalGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Radial ambient background behind petals */}
          <rect width="420" height="420" fill="url(#centerGlow)" />

          {/* Organic layered petals matching reference image */}
          <g filter="url(#softPetalGlow)">
            {/* Top-right tall petal */}
            <path
              d="M380 40 C340 70 280 140 310 220 C360 170 390 100 380 40 Z"
              fill="url(#petal1)"
              stroke="rgba(192, 132, 252, 0.4)"
              strokeWidth="1"
            />
            {/* Main sweeping middle petal */}
            <path
              d="M400 90 C330 130 270 200 315 270 C375 225 410 155 400 90 Z"
              fill="url(#petal2)"
              stroke="rgba(217, 70, 239, 0.45)"
              strokeWidth="1.2"
            />
            {/* Lower spreading fan petal */}
            <path
              d="M410 170 C340 195 295 265 345 325 C400 280 425 220 410 170 Z"
              fill="url(#petal3)"
              stroke="rgba(56, 189, 248, 0.35)"
              strokeWidth="1"
            />
            {/* Inner accent petal */}
            <path
              d="M360 85 C310 115 285 170 315 220 C350 185 375 130 360 85 Z"
              fill="url(#petal1)"
              opacity="0.85"
            />
          </g>
        </svg>
      </div>

      <div className="hero-content">
        <h1 className="hero-title">
          Your Salon
          <br />
          Assistant
        </h1>
        <p className="hero-subtitle">
          Manage bookings, clients, services,
          <br className="subtitle-break" />
          and daily tasks with AI.
        </p>
      </div>
    </section>
  )
}
