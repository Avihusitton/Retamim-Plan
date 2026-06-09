import { Fragment } from 'react';
import useStore from '../store/useStore';

const Visualization2D = () => {
  const { analysisResult, season, timeOfDay, showWind } = useStore();

  if (!analysisResult) {
    return (
      <div className="flex-grow bg-earth-100 rounded-lg border border-earth-300 flex items-center justify-center min-h-[400px] relative overflow-hidden">
        <p className="text-earth-600 font-medium">אזור הדמיית ה-2D יופיע כאן לאחר ניתוח הנתונים</p>
      </div>
    );
  }

  const { layout } = analysisResult;
  const rotation = layout?.houseRotationDegree || 0;
  const windDir = (layout?.windProtection?.direction || 'nw').toLowerCase();

  // Basic Sun logic
  // Time of day: morning (east), noon (south), evening (west)
  // Season: summer (high, closer to center), winter (low, further edge)
  let sunAngle = 0;
  if (timeOfDay === 'morning') sunAngle = 90; // East
  if (timeOfDay === 'noon') sunAngle = 180; // South
  if (timeOfDay === 'evening') sunAngle = 270; // West

  // Convert angle to cartesian for a circle radius
  // Center is (200, 200). Radius depends on season (winter sun is lower/further south)
  const radius = season === 'winter' ? 140 : 80;
  // Note: in SVG, 0 degrees is typically +X, but we want 180 to be South (+Y).
  // Standard math: x = r * cos(theta), y = r * sin(theta)
  // Let's manually map: 90(East)= +X, 180(South)= +Y, 270(West)= -X
  const rad = (sunAngle - 90) * (Math.PI / 180);
  const sunX = 200 + radius * Math.cos(rad);
  const sunY = 200 + radius * Math.sin(rad);

  // Wind logic
  // mapping common directions to angles
  const windMap = {
    'n': 0, 'ne': 45, 'e': 90, 'se': 135, 's': 180, 'sw': 225, 'w': 270, 'nw': 315
  };
  const windAngle = windMap[windDir] !== undefined ? windMap[windDir] : 315; // default nw

  return (
    <div className="flex-grow bg-earth-100 rounded-lg border border-earth-300 flex items-center justify-center min-h-[400px] relative overflow-hidden">

      {/* Compass / Directions Overlay */}
      <div className="absolute top-2 left-2 text-xs text-earth-700 font-mono opacity-60 pointer-events-none select-none">
        <div>צפון: למעלה</div>
        <div>דרום: למטה</div>
      </div>

      <svg viewBox="0 0 400 400" className="w-full h-full max-w-[400px] max-h-[400px]">
        {/* Ground */}
        <rect x="0" y="0" width="400" height="400" fill="#eef1ec" />

        {/* Grid lines for scale */}
        <g stroke="#d6ded1" strokeWidth="1" opacity="0.5">
          {[...Array(9)].map((_, i) => (
             <Fragment key={i}>
                <line x1={i * 50} y1="0" x2={i * 50} y2="400" />
                <line x1="0" y1={i * 50} x2="400" y2={i * 50} />
             </Fragment>
          ))}
        </g>

        {/* The House (Rotated based on AI) */}
        <g transform={`rotate(${rotation}, 200, 200)`}>
          {/* Main House Base */}
          <rect x="150" y="160" width="100" height="80" fill="#c2a176" stroke="#9e7446" strokeWidth="2" rx="4" />

          {/* Internal Courtyard / Special Feature */}
          <rect x="180" y="180" width="40" height="40" fill="#eef1ec" stroke="#d6c19e" strokeWidth="1" />

          {/* Front Door Indicator (Assuming facing "down" natively before rotation) */}
          <rect x="190" y="240" width="20" height="4" fill="#6b4d32" />
        </g>

        {/* Sun Element */}
        <g transform={`translate(${sunX}, ${sunY})`} className="transition-transform duration-700 ease-in-out">
          <circle cx="0" cy="0" r="16" fill="#f59e0b" className="animate-pulse" />
          <circle cx="0" cy="0" r="24" fill="#f59e0b" opacity="0.3" />

          {/* Shadow Ray to House */}
          <line x1="0" y1="0" x2={200 - sunX} y2={200 - sunY} stroke="#f59e0b" strokeWidth="2" strokeDasharray="4" opacity="0.4" />
        </g>

        {/* Wind Elements */}
        {showWind && (
          <g transform={`rotate(${windAngle}, 200, 200)`}>
            {/* Wind comes from top (0 deg) after rotation */}
            <path d="M 180 50 Q 200 80 180 110" fill="none" stroke="#60a5fa" strokeWidth="3" opacity="0.7" className="animate-pulse" />
            <path d="M 220 30 Q 200 60 220 90" fill="none" stroke="#60a5fa" strokeWidth="3" opacity="0.7" className="animate-pulse" />
            <polygon points="175,105 180,115 185,105" fill="#60a5fa" opacity="0.7" />
            <polygon points="215,85 220,95 225,85" fill="#60a5fa" opacity="0.7" />
          </g>
        )}
      </svg>
    </div>
  );
};

export default Visualization2D;
