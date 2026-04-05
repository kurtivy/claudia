import "./index.css";
import { Composition } from "remotion";
import { TwitterCard } from "./TwitterCard";
import { TwitterSquare } from "./TwitterSquare";
import { W3AServices } from "./W3AServices";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* W3A Services pinned tweet video: 1200x675, 6 seconds */}
      <Composition
        id="W3AServices"
        component={W3AServices}
        durationInFrames={612}
        fps={30}
        width={1200}
        height={675}
      />
      {/* Standard Twitter card: 1200x675 (landscape, link previews) */}
      <Composition
        id="TwitterCard"
        component={TwitterCard}
        durationInFrames={90}
        fps={30}
        width={1200}
        height={675}
        defaultProps={{
          headline: "Your headline here",
          subtitle: "Supporting text goes here",
          accentColor: "#1DA1F2",
        }}
      />
      {/* Square Twitter image: 1080x1080 (engagement posts) */}
      <Composition
        id="TwitterSquare"
        component={TwitterSquare}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={{
          headline: "Your headline here",
          subtitle: "Supporting text goes here",
          accentColor: "#1DA1F2",
        }}
      />
    </>
  );
};
