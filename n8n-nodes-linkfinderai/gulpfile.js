const { src, dest, series } = require('gulp');

// tsc compiles .ts -> dist/, but doesn't touch non-TS assets like the node
// icon. Copy those into dist/ after the TypeScript build so n8n finds them
// at the paths declared in package.json's "n8n" field.
function buildIcons() {
	return src('nodes/**/*.{svg,png}').pipe(dest('dist/nodes'));
}

exports['build:icons'] = buildIcons;
exports.default = series(buildIcons);
