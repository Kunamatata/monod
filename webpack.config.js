const path = require('path');
const merge = require('webpack-merge');
const webpack = require('webpack');
const childProcess = require('child_process');
const autoprefixer = require('autoprefixer');

// Webpack plugins
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanPlugin = require('clean-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const OfflinePlugin = require('offline-plugin');
const WebpackRobots = require('@tanepiper/webpack-robotstxt');

// Read `package.json` file
const pkg = require('./package.json');

// Define some constants
const TARGET = process.env.npm_lifecycle_event;
const PATHS  = {
    app: path.join(__dirname, 'app'),
    build: path.join(__dirname, 'build')
};

const VERSION = (() => {
  var v;

  try {
    v = process.env.SOURCE_VERSION || process.env.SHA || childProcess.execSync('git rev-parse HEAD').toString();
  } catch (e) {
    // occurs with Heroku deploy button for instance
    v = 'unknown';
  }

  return v;
})();

// Used to configure Babel (see: `.babelrc` file)
process.env.BABEL_ENV = TARGET;

// Common config, shared by all "targets"
const common = {
    // Entry points are used to define "bundles"
    entry: {
        app: PATHS.app
    },
    // Extensions that should be used to resolve module
    //
    // - `''` is needed to allow imports without an extension
    // - note the `.` before extensions as it will fail to match without!
    resolve: {
        extensions: ['', '.js', '.jsx']
    },
    // Tells Webpack how to write the compiled files to disk
    // Note, that while there can be multiple entry points, only one output
    // configuration is specified
    output: {
        path: PATHS.build,
        // `[name]` is replaced by the name of the chunk
        filename: '[name].js'
    },
    module: {
        // see: https://github.com/isagalaev/highlight.js/issues/895 and
        // https://github.com/webpack/webpack/issues/1721
        noParse: [ /autoit\.js$/ ],
        // Loaders that run *before* others loaders
        preLoaders: [
            {
                test: /\.jsx?$/,
                loaders: ['eslint'],
                include: PATHS.app
            }
        ],
        // Loaders are transformations that are applied on a resource file of
        // an application
        loaders: [
            {
                test: /\.jsx?$/,
                // Enable caching for improved performance during development
                // It uses default OS directory by default. Future webpack
                // builds will attempt to read from the cache to avoid needing
                // to run the potentially expensive Babel recompilation process
                // on each run.
                //
                // Note that gray-matter uses lazy-cache, so we need to unlazy
                // those files to make it compatible with webpack.
                loaders: ['babel?cacheDirectory', 'unlazy'],
                // Parse only app files! Without this it will go through entire
                // project. In addition to being slow, that will most likely
                // result in an error.
                include: PATHS.app
            },
            // FontAwesome, KaTeX
            {
                test: /\.(ttf|eot|svg|woff(2)?)(\?v=.+)?$/,
                loaders: ['file?name=fonts/[name].[ext]'],
                include: [
                  path.join(__dirname, 'node_modules/font-awesome/fonts/'),
                  path.join(__dirname, 'node_modules/katex/dist/fonts/')
                ]
            },
            // Monod fonts
            {
                test: /\.(ttf|eot|svg|woff(2)?)(\?[a-z0-9]+)?$/,
                loaders: ['file?name=[path][name].[ext]&context=./app'],
                include: PATHS.app
            },
            // JSON files (required for markdown-it)
            {
                test: /\.json$/,
                loaders: ['file?name=[path][name].[ext]&context=./node_modules']
            },
            // PNG files (required for emojione)
            {
                test: /\.png$/,
                loaders: ['file?name=[path][name].[ext]&context=./node_modules'],
                include: path.join(__dirname, 'node_modules/emojione/')
            }
        ]
    },
    postcss: [
      autoprefixer({ browsers: ['last 2 versions'] }),
    ],
    node: {
        fs: "empty"
    },
    // Plugins do not operate on individual source files: they influence the
    // build process as a whole
    plugins: [
        // Generate the final HTML5 file, nd include all your webpack bundles
        new HtmlWebpackPlugin({
            template: 'index.ejs',
            // The page's title is read from npm's `package.json` file
            title: pkg.name,
            // Favicon generated with http://realfavicongenerator.net
            favicon: 'app/favicon.ico',
            version: VERSION.substring(0, 7),
            // Main "div" `id`
            appMountId: 'app',
        }),
        new OfflinePlugin({
          caches: 'all',
          scope: '/',
          version: VERSION.substring(0, 7),
          ServiceWorker: {
            cache_name: 'monod'
          },
          AppCache: {
            FALLBACK: { '/': '/' },
            NETWORK: [ '/documents', '*' ]
          }
        })
    ]
};

// Default configuration
if (TARGET === 'dev' || !TARGET) {
    module.exports = merge(common, {
        // Enable sourcemaps
        devtool: 'eval-source-map',
        entry: [
          'react-hot-loader/patch',
          'webpack-dev-server/client?http://localhost:4000',
          'webpack/hot/only-dev-server',
          PATHS.app
        ],
        module: {
            loaders: [
                {
                    test: /\.s?css$/,
                    // Loaders are applied from right to left
                    loaders: ['style', 'css', 'postcss', 'sass'],
                }
            ]
        },
        plugins: [
            new webpack.HotModuleReplacementPlugin()
        ]
    });
}

// Build for production
if (TARGET === 'build') {
    module.exports = merge(common, {
        debug: false,
        devtool: 'source-map',
        output: {
            path: PATHS.build,
            // Set up caching by adding cache busting hashes to filenames
            // `[chunkhash]` returns a chunk specific hash
            filename: '[name].[chunkhash].js',
            // The filename of non-entry chunks
            chunkFilename: '[chunkhash].js'
        },
        module: {
            loaders: [
                // Extract CSS during build
                {
                    test: /\.(css|scss)$/,
                    loader: ExtractTextPlugin.extract(
                      'style',
                      'css?' + JSON.stringify({discardComments: {removeAll: true}}) + '!postcss!sass'
                    )
                }
            ]
        },
        plugins: [
            // `rm -rf`
            new CleanPlugin([ PATHS.build ]),
            // Setting DefinePlugin affects React library size!
            // DefinePlugin replaces content "as is" so we need some extra
            // quotes for the generated code to make sense
            new webpack.DefinePlugin({
                'process.env': {
                    'NODE_ENV': JSON.stringify('production')
                }
            }),
            new webpack.optimize.DedupePlugin(),
            new webpack.optimize.OccurrenceOrderPlugin(),
            // Minification with Uglify
            new webpack.optimize.UglifyJsPlugin({
                output: {
                    comments: false,
                },
                compress: {
                    // Ignore warning messages are they are pretty useless
                    warnings: false
                }
            }),
            // Output extracted CSS to a file
            new ExtractTextPlugin('[name].[chunkhash].css', {
              allChunks: true,
            }),
            new WebpackRobots(),
        ]
    });
}
