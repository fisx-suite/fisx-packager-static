/**
 * @file 工具方法
 * @author sparklewhy@gmail.com
 */

var _ = fis.util;

/**
 * 根据给定的文件集合查找符合 pattern 的文件
 *
 * @param {Object} fileMap 文件 map，key 文件路径
 * @param {Array.<File>} files 所有文件全集
 * @param {Array.<string|RegExp>} patterns 要查找的文件 pattern
 * @param {string=} extName 要满足的文件扩展名，可选
 * @return {Array.<File>}
 */
exports.find = function (fileMap, files, patterns, extName) {
    if (!Array.isArray(patterns)) {
        patterns = [patterns];
    }

    var found = [];
    var existedMap = {};
    var searchPatterns = [];
    var execludePatterns = [];
    patterns.forEach(function (item) {
        var file = fileMap[item];
        var isExclude = false;
        if (file) {
            if (!existedMap[file.subpath]) {
                found.push(file);
                existedMap[file.subpath] = true;
            }
            return;
        }
        else if (_.isString(item)) {
            isExclude = item.charAt(0) === '!';

            if (isExclude) {
                item = item.substr(1);
            }

            item = _.glob(item);
        }
        isExclude ? execludePatterns.push(item) : searchPatterns.push(item);
    });

    var len = searchPatterns.length;
    var excludeLen = execludePatterns.length;
    extName && (extName = extName.toLowerCase());
    files.forEach(function (file) {
        var reg;
        for (var j = 0; j < excludeLen; j++) {
            reg = execludePatterns[j];
            if (reg.test(file.subpath)) {
                return;
            }
        }

        for (var i = 0; i < len; i++) {
            reg = searchPatterns[i];
            if (((_.isFunction(reg) && reg(file.subpath)) || reg.test(file.subpath))
                && (!extName || file.rExt === extName)) {
                if (!existedMap[file.subpath]) {
                    found.push(file);
                    existedMap[file.subpath] = true;
                }
            }
        }
    });
    existedMap = null;

    return found;
};

/**
 * 给定的字符串是否匹配给定的 patterns
 *
 * @param {string} str 要判断字符串
 * @param {Array.<Function|RegExp>} patterns 要匹配的 pattern
 * @return {boolean}
 */
exports.isMatch = function (str, patterns) {
    for (var j = 0, len = patterns.length; j < len; j++) {
        var reg = patterns[j];
        if ((_.isFunction(reg) ? reg(str) : reg.test(str))) {
            return true;
        }
    }

    return false;
};

/**
 * 判断给定的路径是不是本地路径
 *
 * @param {string} filePath 要判断的文件路径
 * @return {boolean}
 */
exports.isLocalPath = function (filePath) {
    return !(/^\/\//.test(filePath) || /^[a-z][a-z0-9\+\-\.]+:/i.test(filePath));
};

/**
 * 将给定的集合做合并，并移除重复的
 *
 * @param {...Array} a 要合并的集合
 * @return {Array}
 */
exports.union = function () {
    var all = Array.prototype.concat.apply([], arguments);
    var result = [];
    all.forEach(function (item) {
        if (result.indexOf(item) === -1) {
            result.push(item);
        }
    });
    return result;
};
