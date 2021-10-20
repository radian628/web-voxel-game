#version 300 es

precision highp float;

layout(location=0) in vec2 vertexPositionIn;

layout(location=1) in uint panelVertexPosition;
layout(location=2) in uint panelMaterialAndOrientation;

out vec3 vertexPositionOut;
out vec3 normal;
flat out uint material;

uniform uint chunkModuloBitmask;
uniform uint chunkModuloBitshiftY;
uniform uint chunkModuloBitshiftZ;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

const vec3[] normalTable = vec3[](
    vec3(-1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    vec3(0.0, -1.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 0.0, -1.0),
    vec3(0.0, 0.0, 1.0)
);

void main() {
    uint panelOrientation = panelMaterialAndOrientation >> 13; //get orientation (last 3 bits)
    vec3 panelBasePos = vec3( //get "base position" of panel by dividing and modulo-ing the panel vertex position input.
        float(panelVertexPosition & chunkModuloBitmask),
        float((panelVertexPosition >> chunkModuloBitshiftY) & chunkModuloBitmask),
        float((panelVertexPosition >> chunkModuloBitshiftZ) & chunkModuloBitmask)
    );
    float perpendicularAxisOffset = ((panelOrientation & 1u) == 1u) ? 1.0 : 0.0;
    uint panelAxisOrientation = panelOrientation >> 1u;
    vec3 panelPos = vec3(vertexPositionIn, perpendicularAxisOffset);
    switch (panelAxisOrientation) {
    case 0u:
        panelPos = panelPos.zxy;
        break;
    case 1u:
        panelPos = panelPos.xzy;
        break;
    case 2u:
        break;
    }
    vec3 pos = (panelBasePos + panelPos);
    vertexPositionOut = pos;
    gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    normal = normalTable[panelOrientation];
    material = panelMaterialAndOrientation & 8191u; //first 13 bits.
}