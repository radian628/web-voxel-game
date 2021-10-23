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
in vec4 shadowMappedPosition2;
in vec3 normal;
flat in uint material;

out vec4 fragColor;

uniform sampler2D shadowMap1;
uniform sampler2D shadowMap2;
uniform vec4 lightDir;
//uniform mat4 ml;

float getShadowValue(sampler2D shadowMap, vec3 shadowCoords, float shadowFadeOut) {
  float shadowLight = 0.0;
  for (float i = -1.0; i < 2.0; i++) {
    for (float j = -1.0; j < 2.0; j++) {
      vec2 offset = vec2(i, j) / 1024.0;
      float shadowDepth = texture(shadowMap, shadowCoords.xy + offset).r;
      //float shadowLight = 1.0;
      float bias = 1.5*max(0.0008 * (1.0 - dot(normal, normalize(lightDir.xyz))), 0.00008);
      float shadowLightSample = (shadowCoords.z-bias > shadowDepth) ? 0.2 * shadowFadeOut : 1.0;
      shadowLight += shadowLightSample / 9.0;
    }
  }

  return shadowLight;
} 

void main() {
  //vec4 shadowCoords4 = ml * vec4((floor(vertexPositionOut * 8.0 +0.001) + 0.5) / 8.0, 1.0);
  //vec3 shadowCoords = shadowCoords4.xyz / shadowCoords4.w;
  
  vec3 shadowCoords = shadowMappedPosition.xyz / shadowMappedPosition.w;
  float shadowLight;
  if (clamp(shadowCoords, -1.0, 1.0) == shadowCoords) {
    shadowCoords = shadowCoords * 0.5 + 0.5;
    shadowLight = getShadowValue(shadowMap1, shadowCoords, 1.0);
  } else {
    vec3 shadowCoords = shadowMappedPosition2.xyz / shadowMappedPosition2.w;
    shadowCoords = shadowCoords * 0.5 + 0.5;
    vec3 absShadowCoords = abs(shadowCoords - 0.5);
    shadowLight = getShadowValue(shadowMap2, shadowCoords, clamp((max(max(absShadowCoords.x, absShadowCoords.y), absShadowCoords.z) - 0.25) * 20.0, 1.0, 5.0));
  }


  
  float lightIntensity = dot(normal, normalize(lightDir.xyz));
  float brightness = max(lightIntensity * shadowLight, 0.1);
  fragColor = vec4(brightness * hsv2rgb(vec3(float(material) * 0.3, 1.0, 1.0)), 1.0);
  //fragColor = vec4(vec3(shadowCoords.z) * 0.5 + 0.5, 1.0);
  //fragColor = texture(shadowMap, vertexPositionOut.xy / 16.0);
}