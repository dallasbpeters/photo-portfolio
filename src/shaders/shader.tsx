/** biome-ignore-all assist/source/organizeImports: because */
import { Shader, Dither, Plasma, WaveDistortion } from "shaders/react";

export default function ShaderEffect() {
  return (
    <Shader>
      <Dither
        colorA="#57e447"
        colorB="#8a54f9"
        pattern="bayer8"
        pixelSize={7}
        threshold={0.41}
      >
        <Plasma
          colorA="#ffffff"
          contrast={0.9}
          density={0.3}
          intensity={1.3}
          speed={1}
          stops={[
            { color: "#ffffff", position: 0 },
            { color: "#000000", position: 1 },
          ]}
        />
        <WaveDistortion
          angle={84}
          edges="mirror"
          frequency={1.8}
          strength={1}
          visible={true}
          waveType="square"
        />
      </Dither>
    </Shader>
  );
}
