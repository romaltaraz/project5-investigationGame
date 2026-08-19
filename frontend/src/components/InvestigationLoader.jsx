import '../styles/components/investigation-loader.css';

export default function InvestigationLoader({ label = 'טוען...', fullPage = false, className = '' }) {
  return (
    <div className={`inv-loader ${fullPage ? 'inv-loader--full' : ''} ${className}`}>
      <div className="inv-loader__stage">
        <div className="inv-loader__glow" />

        <div className="inv-loader__video-frame">
          <video
            className="inv-loader__video"
            src="/investigation-loader.mp4"
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
          />
        </div>
      </div>

      {label && <p className="inv-loader__label">{label}</p>}
    </div>
  );
}
