const VOXEL_CHUNK_SIZE = 16;
const VOXEL_CHUNK_VOLUME = Math.pow(VOXEL_CHUNK_SIZE, 3);

let getAsset = makeAssetLoader();


class Client {
  constructor(mainCanvas) {
    this.gl = mainCanvas.getContext("webgl2");
    this.gl.viewport(0, 0, mainCanvas.width, mainCanvas.height);
    this.projectionMatrix = perspective(Math.PI / 1.3, 0.1, 1000);
    this.viewMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      -8, -8, -10, 1
    ];
  }

  async doAsyncInitialization() {
    this.programs = {
      block: await this.makeShaderPair("shaders/block.vert", "shaders/block.frag")
    }

  }

  async makeShaderPair(vertURL, fragURL) {
    return buildShaderProgram(this.gl, await getAsset(vertURL), await getAsset(fragURL));
  }
}

class DrawVoxelChunk {
  constructor(client) {
    let gl = client.gl;
    this.vao = gl.createVertexArray();
    this.instanceBuffer = gl.createBuffer();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0,1,2,1,2,3]), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,0,1,1,0,1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.enableVertexAttribArray(0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_SHORT, 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribDivisor(1, 1);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_SHORT, 4, 2);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribDivisor(2, 1);

    this.voxelChunkSize = VOXEL_CHUNK_SIZE;
    this.instanceCount = 0;
  }

  updateAttribs(client, instanceBufferData) {
    let gl = client.gl;
    this.instanceCount = instanceBufferData.length/2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceBufferData, gl.STREAM_DRAW);
  }

  updateSize(client, voxelChunkSize) {
    this.voxelChunkSize = voxelChunkSize;
    this.chunkModuloBitmask = this.voxelChunkSize - 1;
    this.chunkModuloBitshift = Math.log2(voxelChunkSize);
  }

  draw(client) {
    let gl = client.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.useProgram(client.programs.block);
    setUniform(gl, client.programs.block, "chunkModuloBitmask", "1ui", this.voxelChunkSize - 1);
    setUniform(gl, client.programs.block, "chunkModuloBitshiftY", "1ui", this.chunkModuloBitshift);
    setUniform(gl, client.programs.block, "chunkModuloBitshiftZ", "1ui", this.chunkModuloBitshift * 2);
    gl.uniformMatrix4fv(gl.getUniformLocation(client.programs.block, "projectionMatrix"), false, client.projectionMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(client.programs.block, "viewMatrix"), false, client.viewMatrix);
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, this.instanceCount)
  }
}

class VoxelChunk {
  constructor(data, position) {
    this.data = data;
    if (!this.data) this.data = new Uint16Array(VOXEL_CHUNK_VOLUME);
    this.position = position;
    this.size = VOXEL_CHUNK_SIZE; //future support for LODs?
  }

  getIndexFromCoords(x, y, z) {
    return x + this.size * (y + this.size * z);
  }

  getBlockFromCoords(x, y, z) {
    return this.data[this.getIndexFromCoords(x, y, z)];
  }

  getBlockFromIndex(index) {
    return this.data[index];
  }

  getMeshPanels() {
    let ATTRIBUTE_SIZE =
      2 /*16-bit position in chunk*/ +
      2; /*14-bit material index + 3-bit orientation*/

    let attributeBuffer = new ArrayBuffer(
      3 * (this.size + 1) * Math.pow(this.size, 2) * ATTRIBUTE_SIZE
    );
    let int16View = new Uint16Array(attributeBuffer);
    let abIndex = 0;

    function addPanel(posIndex, material, orientation) {
      int16View[abIndex] = posIndex;
      int16View[abIndex+1] = material + (orientation << 13);
      abIndex += 2;
    }

    let forBlocks = callback => {
      for (let z = 0; z < this.size; z++) {
        for (let y = 0; y < this.size; y++) {
          for (let x = 0; x < this.size; x++) {
            let index = this.getIndexFromCoords(x, y, z);
            let block = this.data[index];
            callback(x,y,z,index,block);
          }
        }
      }
    }

    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = (x != 0) ? this.data[index - 1] : 0;
        if (!adjacent) addPanel(index, block, 0);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = (x != this.size - 1) ? this.data[index + 1] : 0;
        if (!adjacent) addPanel(index, block, 1);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = y != 0 ? this.data[index - this.size] : 0;
        if (!adjacent) addPanel(index, block, 2);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = y != this.size - 1 ? this.data[index + this.size] : 0;
        if (!adjacent) addPanel(index, block, 3);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = z != 0 ? this.data[index - this.size * this.size] : 0;
        if (!adjacent) addPanel(index, block, 4);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = z != this.size - 1 ? this.data[index + this.size * this.size] : 0;
        if (!adjacent) addPanel(index, block, 5);
      }
    });

    return int16View.subarray(0, abIndex);
  }
}

let mouseMovement = [0, 0];
document.addEventListener("mousemove", e => {
  mouseMovement[0] += e.movementX;
  mouseMovement[1] += e.movementY;
});

let keys = createKeyHandler();

let t = 0;
async function main() {
  let rotationY = 0;
  let rotationX = 0;

  
  let viewerPosition =[0, 0, 0];
  let viewerVelocity = [0, 0, 0];

  let canvas = document.getElementById("canvas");

  window.addEventListener("resize", e => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    client.gl.viewport(0, 0, canvas.width, canvas.height);
  });

  setupPointerLock(canvas);

  let client = new Client(canvas);

  await client.doAsyncInitialization();

  let chunk = new VoxelChunk();
  for (let i = 0; i < chunk.data.length; i++) {
    chunk.data[i] = Math.random() > 0.6 ? Math.floor(Math.random() * 5) : 0;
  }
  //chunk.data[0] = 1;
  //chunk.data[1] = 1;
  console.log(chunk, chunk.getMeshPanels());

  let drawChunk = new DrawVoxelChunk(client);
  drawChunk.updateAttribs(client, chunk.getMeshPanels());
  drawChunk.updateSize(client, VOXEL_CHUNK_SIZE);
  function loop() {
    rotationY += mouseMovement[0] * 0.003;
    rotationX += mouseMovement[1] * 0.003;
    mouseMovement = [0, 0];

    if (keys.a) {
      viewerVelocity[0] += Math.cos(rotationY) * 0.1;
      viewerVelocity[2] += Math.sin(rotationY) * 0.1;
    }
    if (keys.d) {
      viewerVelocity[0] -= Math.cos(rotationY) * 0.1;
      viewerVelocity[2] -= Math.sin(rotationY) * 0.1;
    }
    if (keys.w) {
      viewerVelocity[0] += -Math.sin(rotationY) * 0.1;
      viewerVelocity[2] += Math.cos(rotationY) * 0.1;
    }
    if (keys.s) {
      viewerVelocity[0] -= -Math.sin(rotationY) * 0.1;
      viewerVelocity[2] -= Math.cos(rotationY) * 0.1;
    }
    if (keys[" "]) {
      viewerVelocity[1] -= 0.1;
    }
    if (keys.shift) {
      viewerVelocity[1] += 0.1
    }

    viewerPosition = vectorAdd(viewerPosition, viewerVelocity);
    viewerVelocity = scalarMultiply(viewerVelocity, 0.9);

    rotationX = Math.max(Math.min(rotationX, Math.PI / 2), -Math.PI / 2)
    let rotmat = matMultiplyMat(rotateY(-rotationY), rotateX(-rotationX));
    client.viewMatrix = matMultiplyMat4x4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      viewerPosition[0], viewerPosition[1], viewerPosition[2], 1
    ],[
      rotmat[0], rotmat[1], rotmat[2], 0,
      rotmat[3], rotmat[4], rotmat[5], 0,
      rotmat[6], rotmat[7], rotmat[8], 0,
      0, 0, 0, 1
    ]);
    drawChunk.draw(client);
    //console.log(client.gl.getError());
    t++;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main();