import {
  ChromaFlow,
  Dither,
  Glass,
  Shader,
  SineWave,
  SolidColor,
  Swirl,
} from "shaders/react";

interface DPDLogoShaderProps {
  className: string;
  colorA?: string;
  colorB?: string;
}

export default function DPDLogoShader({
  className,
  colorA,
  colorB,
}: DPDLogoShaderProps) {
  return (
    <Shader className={className}>
      <SolidColor color="oklch(8.4% 0.1 180.91)" visible={true} />

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
      <Glass
        center={{
          x: 0.7,
          y: 0.66,
        }}
        cutout={true}
        fresnel={0.04}
        fresnelSoftness={0.05}
        highlight={0.5}
        highlightColor="#47a690"
        highlightSoftness={0.21}
        innerZoom={1.5}
        lightAngle={237}
        refraction={2}
        scale={0.7078}
        shapeSdfUrl="https://data.shaders.com/storage/v1/object/public/user-uploaded-images/user_3E93x1BOQFIvRduMb5kBj66tBhe/PYZuib5WaNT3_sdf.bin"
        thickness={1}
      >
        <Swirl
          colorA="oklch(27.07% 0.0092 285.77)"
          colorB="oklch(27.07% 0.0092 285.77)"
          detail={5}
          speed={0.2}
          stops={[
            { color: "#26262b", position: 0 },
            { color: "#0d111a", position: 1 },
          ]}
        />
        <ChromaFlow
          baseColor="#00ff88"
          downColor="#ffdd00"
          leftColor="#ffdd00"
          momentum={10}
          radius={2}
          rightColor="#ffdd00"
          upColor="#ffdd00"
        />
      </Glass>
    </Shader>
  );
}
