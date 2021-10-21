#version 300 es

precision highp float;

in vec3 vertexPositionOut;

out vec4 depth;

void main() {
  depth = vec4(vec3(gl_FragCoord.z), 1.0);
  //gl_FragDepth = 0.75;
}