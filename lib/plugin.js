/**
 * @file 处理通过插件加载的资源的引用路径更新
 * @author sparklewhy@gmail.com
 */

var amdHelper = require('fisx-amd');

/**
 * 查找打包文件
 *
 * @inner
 * @param {File} file 被打包的文件
 * @param {Array.<Object>} packedFiles 所有打包的文件信息
 * @return {?Object}
 */
function findPackFile(file, packedFiles) {
    var packTo = file.packTo;
    for (var i = packedFiles.length - 1; i >= 0; i--) {
        var item = packedFiles[i];

        if (Array.isArray(packTo)) {
            if (packTo.length > 1) {
                fis.log.warning('resource %j which is packed to '
                + 'multitarget, cannot process this situation!', packTo);
                return;
            }
            packTo.length === 1 && (packTo = packTo[0]);
        }

        if (item.pkg.subpath === packTo) {
            return item;
        }
    }
}

/**
 * 获取插件资源的打包信息, 返回的对象 key 为插件资源文件的 id, value 为打包的文件信息
 *
 * @inner
 * @param {Array.<File>} pluginResources 插件资源
 * @param {Array.<Object>} packedFiles 所有打包的文件
 * @return {Object}
 */
function getPluginResourcePackInfo(pluginResources, packedFiles) {
    var result = {};
    var notPackRes = [];
    pluginResources.forEach(function (item) {
        var packFile = findPackFile(item, packedFiles);
        if (packFile) {
            result[item.id] = {
                file: item,
                packTo: packFile
            };
        }
        else {
            notPackRes.push(item);
        }
    });
    return {
        pack: result,
        notPacks: notPackRes
    };
}

/**
 * 更新插件资源加载的路径，替换为其打包的文件路径
 *
 * @inner
 * @param {File} file 要更新的文件
 * @param {Object} moduleConfig 模块配置信息
 * @param {Object} pluginResPackInfo 插件资源打包信息
 */
function updatePluginResourceRequirePath(file, moduleConfig, pluginResPackInfo) {
    file.setContent(amdHelper.updateResourceId(
        file.getContent(),
        function (resId, moduleInfo, isAsynDep) {
            if (resId.indexOf('!') === -1) {
                return resId;
            }

            var moduleId = moduleInfo.id
                || amdHelper.getModuleId(file.id, moduleConfig, true);
            if (!moduleId) {
                return resId;
            }

            var resInfo = amdHelper.getResourceInfo(
                resId, isAsynDep ? null : moduleId, moduleConfig
            );
            var resFileInfo = pluginResPackInfo[resInfo.pluginResource.path];
            if (resFileInfo) {
                var pkg = resFileInfo.packTo.pkg;
                var pluginResId = amdHelper.getResourceId(
                    pkg.realpath, moduleConfig, true
                );
                return resInfo.module.rawId + '!' + pluginResId;
            }

            return resId;
        }
    ));
}

/**
 * 添加没有被打包的插件资源
 *
 * @param {Array.<File>} target 没打包的插件资源集合
 * @param {Array.<File>} resFiles 要添加的资源文件
 */
function addNotPackPluginRes(target, resFiles) {
    resFiles.forEach(function (item) {
        if (target.indexOf(item) === -1) {
            target.push(item);
        }
    });
}

/**
 * 更新插件加载的资源路径：把被打包的插件资源路径替换为打包后的文件路径
 *
 * @param {Array.<Object>} packedFiles 打包的文件信息
 * @param {Context} context 打包上下文
 * @return {Array.<Object>} 没有打包的插件资源
 */
module.exports = exports = function (packedFiles, context) {
    if (!packedFiles.length) {
        return;
    }

    var moduleConfig = context.moduleConfig;
    var pluginResFiles = [];
    context.files.forEach(function (file) {
        // 只处理 js 文件的插件资源的加载
        if (!file.isJsLike) {
            return;
        }

        var pluginResources = context.getLinkResources(file, true);
        var packResult = getPluginResourcePackInfo(pluginResources, packedFiles);

        addNotPackPluginRes(pluginResFiles, packResult.notPacks);

        var pluginResPackInfo = packResult.pack;
        if (!Object.keys(pluginResPackInfo).length) {
            return;
        }

        updatePluginResourceRequirePath(file, moduleConfig, pluginResPackInfo);
    });

    return pluginResFiles;
};
