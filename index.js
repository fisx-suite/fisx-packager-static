/**
 * @file 静态资源打包插件，支持 amd 模块打包
 * @author sparklewhy@gmail.com
 */

var _ = fis.util;
var htmlParser = require('./lib/html');
var Context = require('./lib/context');
var packUtil = require('./lib/pack');

/**
 * 初始化 页面打包信息
 *
 * @inner
 * @param {Context} context 打包上下文
 * @param {Object} parseOpts 解析选项
 * @param {Object} settings 打包设置选项
 */
function initPackInfo(context, parseOpts, settings) {
    // 初始化页面打包信息
    packUtil.packPage(context, parseOpts);

    // 初始化指定的文件打包信息
    var bundles = settings.bundles || [];
    bundles.forEach(function (packItem) {
        var options = _.merge({}, packItem);

        var load = packItem.load;
        load === true && (load = parseOpts.pageFiles);
        options.load = load;

        options.host = null;
        options.rawCombines = null;
        context.addToPackItem(packUtil.createPackItem(options, context));
    });
}

/**
 * 打包插件入口
 *
 * @param {Object} ret 处理的资源信息全集
 * @param {Object} pack 打包信息
 * @param {Object} settings 设置选项
 * @param {Object} opt 全局选项
 */
module.exports = exports = function (ret, pack, settings, opt) {
    try {
        var context = new Context(ret);
        var parseOpts = _.assign({}, htmlParser.defaultOptions, settings.page);
        parseOpts.pageFiles = context.findFileByPattern(parseOpts.files || '*.html');
        parseOpts.pageFiles.forEach(function (file) {
            htmlParser.initPagePlaceholder(file, context, parseOpts);
        });

        // 初始化打包信息
        initPackInfo(context, parseOpts, settings);

        // 初始化打包的顺序
        var packedFiles = packUtil.orderPackItems(context.toPackItems);

        // 开始真正的打包逻辑
        packedFiles = packedFiles.map(function (item) {
            return packUtil.packStaticFiles(context, item);
        }).filter(function (item) {
            return item;
        });

        packUtil.outputPackInfo(packedFiles, context, parseOpts, settings);
    }
    catch (ex) {
        fis.log.error(ex.stack);
    }
};
