#version 300 es

precision highp float;

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

in vec3 vertexPositionOut;
in vec4 shadowMappedPosition;
in vec3 normal;
flat in uint material;

out vec4 fragColor;

uniform sampler2D shadowMap;
uniform vec4 lightDir;

void main() {
  vec3 shadowCoords = shadowMappedPosition.xyz / shadowMappedPosition.w;
  shadowCoords = shadowCoords * 0.5 + 0.5;
  float shadowDepth = texture(shadowMap, shadowCoords.xy).r;

  float bias = -0.001;//max(0.002 * (1.0 - dot(normal, normalize(lightDir.xyz))), 0.0002);
  float shadowLight = 1.0;
  if (clamp(shadowCoords, 0.0, 1.0) == shadowCoords) {
    shadowLight = (shadowDepth > shadowCoords.z-bias) ? 1.0 : 0.2;
  }
  
  float lightIntensity = dot(normal, normalize(lightDir.xyz));
  float brightness = max(lightIntensity, 0.2) * shadowLight;
  fragColor = vec4(brightness * hsv2rgb(vec3(float(material) * 0.3, 1.0, 1.0)), 1.0);
  //fragColor = vec4(vec3(shadowCoords.z) * 0.5 + 0.5, 1.0);
  //fragColor = texture(shadowMap, vertexPositionOut.xy / 16.0);
}