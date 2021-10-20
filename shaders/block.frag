#version 300 es

precision highp float;

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

in vec3 vertexPositionOut;
in vec3 normal;
flat in uint material;

out vec4 fragColor;

void main() {
  float shadow = dot(normal, normalize(vec3(1.0, 2.0, 3.0)));
  fragColor = vec4((shadow * 0.4 + 0.6) * hsv2rgb(vec3(float(material) * 0.3, 1.0, 1.0)), 1.0);
}