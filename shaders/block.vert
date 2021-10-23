#version 300 es

precision highp float;

layout(location=0) in vec2 vertexPositionIn;

layout(location=1) in uint panelVertexPosition;
layout(location=2) in uint panelMaterialAndOrientation;

out vec3 vertexPositionOut;
out vec4 shadowMappedPosition;
out vec4 shadowMappedPosition2;
out vec3 normal;
flat out uint material;

uniform uint chunkModuloBitmask;
uniform uint chunkModuloBitshiftY;
uniform uint chunkModuloBitshiftZ;
uniform mat4 mvp;
uniform mat4 ml;
uniform mat4 ml2;

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
    bool isPerpendicularAxisOffset = ((panelOrientation & 1u) == 1u);
    uint panelAxisOrientation = panelOrientation >> 1u;
    vec3 panelPos = isPerpendicularAxisOffset ? vec3(vertexPositionIn.x, 1.0-vertexPositionIn.y, 1.0) : vec3(vertexPositionIn.x, vertexPositionIn.y, 0.0);
    switch (panelAxisOrientation) {
    case 0u:
        panelPos = panelPos.zxy;
        break;
    case 1u:
        panelPos = panelPos.yzx;
        break;
    case 2u:
        break;
    }
    vec3 pos = (panelBasePos + panelPos);
    vertexPositionOut = pos;
    shadowMappedPosition = (ml * vec4(pos, 1.0));
    shadowMappedPosition2 = (ml2 * vec4(pos, 1.0));
    gl_Position = mvp * vec4(pos, 1.0);
    normal = normalTable[panelOrientation];
    material = panelMaterialAndOrientation & 8191u; //first 13 bits.
}