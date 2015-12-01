/**
 * @file 打包顺序
 * @author sparkelwhy@gmail.com
 */

/**
 * 创建依赖图
 *
 * @inner
 * @param {Array.<Object>} packedFiles 所有要打包的文件信息
 * @return {Array.<Object>}
 */
function createDepGraph(packedFiles) {
    var nodeList = [];
    var nodeMap = {};
    var nodeData = [];

    // 创建图的节点
    packedFiles.forEach(function (item, index) {
        var nodeId = item.packId || ('_node_' + index);
        var data = {id: nodeId, value: item};
        nodeData.push(data);
        var node = {
            'id': nodeId,
            'data': data,
            'in': 0
        };
        nodeMap[nodeId] = node;
        nodeList[index] = node;
    });

    var initDepNodes = function (node, nodeMap) {
        node.data.value.depPackIds.forEach(function (nodeId) {
            var depNode = nodeMap[nodeId];
            if (!depNode) {
                return fis.log.error('unknow pack id: %s', nodeId);
            }
            node.in += 1;

            var deps = depNode.deps || [];
            if (deps.indexOf(node) === -1) {
                deps.push(node);
            }
            depNode.deps = deps;
        });
    };

    // 初始化图节点的依赖信息
    nodeData.forEach(function (item) {
        initDepNodes(nodeMap[item.id], nodeMap);
    });

    return nodeList;
}

function findZeroInDegreeNode(nodeList) {
    var found;
    nodeList.some(function (item) {
        if (item.in === 0) {
            found = item;
            return true;
        }
    });
    return found;
}

function removeZeroInDegreeNode(node, nodeList) {
    (node.deps || []).forEach(function (item) {
        item.in--;
        if (item.in < 0) {
            item.in = 0;
        }
    });
    var index = nodeList.indexOf(node);
    nodeList.splice(index, 1);
}

/**
 * 排序打包文件的顺序，按照打包文件的依赖顺序进行打包
 *
 * @param {Array.<Object>} packedFiles 所有要打包的文件信息
 * @return {Array.<Object>}
 */
function sortPackOrder(packedFiles) {
    var nodes = createDepGraph(packedFiles);
    var found;
    var packList = [];
    while ((found = findZeroInDegreeNode(nodes))) {
        packList.push(found.data.value);
        removeZeroInDegreeNode(found, nodes);
    }

    if (nodes.length) {
        fis.log.error('the pack order existed dependence circle: %j', nodes);
    }

    return packList;
}

module.exports = exports = sortPackOrder;
