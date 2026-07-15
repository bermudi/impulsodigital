module.exports = function(eleventyConfig) {
    // Copy static files directly to output
    eleventyConfig.addPassthroughCopy("src/assets");

    return {
        dir: {
            input: "src",
            output: "_site",
            includes: "_includes",
            layouts: "_layouts"
        }
    };
};
