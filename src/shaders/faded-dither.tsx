import { Dither, Shader, SineWave, SolidColor } from "shaders/react";

interface FadedDitherProps {
  className?: string;
  colorA?: string;
  colorB?: string;
}

export default function FadedDither({
  className,
  colorA = "oklch(14.7% 0.03 230.31)",
  colorB = "oklch(41.04% 0.1 180.91)",
}: FadedDitherProps) {
  return (
    <Shader className={className}>
      <SolidColor color="oklch(8.4% 0.1 180.91)" />
      <Dither colorA={colorA} colorB={colorB} pattern="bayer8" threshold={0.41}>
        <SineWave
          angle={24}
          frequency={0.5}
          position={{
            x: 0.69,
            y: 0.7,
          }}
          softness={0.7}
          speed={0.1}
          thickness={0.2}
        />
      </Dither>
    </Shader>
  );
}
