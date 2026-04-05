import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type Props = {
  headline: string;
  subtitle: string;
  accentColor: string;
};

export const TwitterCard: React.FC<Props> = ({
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

  const barWidth = interpolate(frame, [5, 40], [0, 200], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "60px 80px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          width: barWidth,
          height: 4,
          backgroundColor: accentColor,
          marginBottom: 40,
          borderRadius: 2,
        }}
      />

      {/* Headline */}
      <div
        style={{
          color: "#ffffff",
          fontSize: 52,
          fontWeight: 700,
          lineHeight: 1.2,
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
          marginTop: 20,
          opacity: subtitleOpacity,
          maxWidth: "80%",
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  );
};
