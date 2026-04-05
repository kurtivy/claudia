import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type Props = {
  headline: string;
  subtitle: string;
  accentColor: string;
};

export const TwitterSquare: React.FC<Props> = ({
  headline,
  subtitle,
  accentColor,
}) => {
  const frame = useCurrentFrame();

  const headlineOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const headlineY = interpolate(frame, [0, 20], [30, 0], {
    extrapolateRight: "clamp",
  });

  const subtitleOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateRight: "clamp",
  });

  const circleScale = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Decorative circle */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          border: `3px solid ${accentColor}`,
          marginBottom: 50,
          transform: `scale(${circleScale})`,
          opacity: circleScale,
        }}
      />

      {/* Headline */}
      <div
        style={{
          color: "#ffffff",
          fontSize: 54,
          fontWeight: 700,
          lineHeight: 1.2,
          textAlign: "center",
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          maxWidth: "90%",
        }}
      >
        {headline}
      </div>

      {/* Subtitle */}
      <div
        style={{
          color: "#a0a0b0",
          fontSize: 28,
          fontWeight: 400,
          marginTop: 24,
          textAlign: "center",
          opacity: subtitleOpacity,
          maxWidth: "85%",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
