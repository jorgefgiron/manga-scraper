var manga_scraper = require('./manga-scraper.js');
var manga_downloader = require('./manga-downloader.js');
var manga_file = require('./manga-file.js');

var Promise = require('bluebird');
var URI = require('URIjs');
var path = require('path');
var jsonfile = require('jsonfile');
var fs = require('fs');
var async = require('async');

var exports = module.exports;

exports.getMangaJsonInList = getMangaJsonInList;
exports.updateMangaJsonInList = updateMangaJsonInList;
exports.getMangaJson = getMangaJson;
exports.updateMangaJson = updateMangaJson;

/**
 *
 * @param manga_list_file
 * @param opts
 */
function getMangaJsonInList(manga_list_file, opts) {
    // Defaults.
    var overwrite = false;
    var manga_json_dir = 'manga_json';

    if (opts.overwrite) { overwrite = opts.overwrite; }
    if (opts.json_directory) { manga_json_dir = opts.json_directory; }

    try {
        manga_file.exists(manga_list_file, function(exists) {
            if (!exists) {
                var message = manga_list_file + ' does not exist';
                throw new manga_file.FileDoesNotExistException(message, manga_list_file);
            }
        });
        // ...
        // http://mangafox.me/manga/shingeki_no_kyojin/
        // http://mangafox.me/manga/sidonia_no_kishi/
        // http://mangafox.me/manga/asu_no_yoichi/
        // ...
        var manga_urls = manga_file.readMangaFileSync(manga_list_file);
        var ext = '.json';
        var manga_to_process = [];
    } catch (err) {
        console.log(err);
    }

    var promise = new Promise(function (resolve) {
        manga_urls.forEach( function(manga_url) {
            var file = path.join(manga_json_dir, manga_scraper.getMangaNameFromUrl(manga_url) + ext); // eg. shingeki_no_kyojin.json

            if (overwrite) { // Overwrite JSON_File if true.
                manga_to_process.push(manga_url);
            } else {
                if (!fs.existsSync(file)) { // If the JSON file doesn't exist.
                    manga_to_process.push(manga_url);
                }
            }

        });
        resolve(manga_to_process);
    });

    promise.then(function (manga_to_process) {
        var asyncTasks = [];
        manga_to_process.forEach(function(manga_url){
            (function(mga_url) {
                asyncTasks.push(
                    function(callback) {
                        getMangaJson(mga_url, function(done) {
                            setTimeout(function() {
                                callback(null, {'manga_url': mga_url, 'done': done});
                            }, opts['timeout']);

                        })
                    }

                )
            })(manga_url);
        });

        console.time(manga_list_file);

        async.series(asyncTasks, function(err, results) {
            console.log('Errors:');
            console.log(err);
            console.log('Results:');
            console.log(results);
            console.timeEnd(manga_list_file);
            console.log('\n\n');
        });

    });

}

function updateMangaJsonInList(manga_json_dir, opts) {
    // Defaults.

    //if (opts.json_directory) { manga_json_dir = opts.json_directory; }

    try {
        manga_file.exists(manga_json_dir, function(exists) {
            if (!exists) {
                var message = manga_json_dir + ' does not exist';
                throw new manga_file.FileDoesNotExistException(message, manga_json_dir);
            }
        });
    } catch (err) {
        console.log(err);
    }

    // ...
    // manga_json/shingeki_no_kyojin.json
    // manga_json/sidonia_no_kishi.json
    // ...
    var manga_json_files = manga_file.readJsonFilesInDirSync(manga_json_dir);

    var asyncTasks = [];
    manga_json_files.forEach(function(manga_json_file){
        var f = path.join(manga_json_dir, manga_json_file);
        console.log(f);
        (function(mga_json_f) {
            asyncTasks.push(
                function(callback) {
                    updateMangaJson(mga_json_f, opts, function(done) {
                        setTimeout(function() {
                            callback(null, {'manga_url': mga_json_f, 'done': done});
                        }, opts['timeout']);
                    })
                }

            )
        })(f);
    });

    console.time(manga_json_dir);

    async.series(asyncTasks, function(err, results) {
        console.log('Errors:');
        console.log(err);
        console.log('Results:');
        console.log(results);
        console.timeEnd(manga_json_dir);
        console.log('\n\n');
    });

}
/**
 *
 *
 * @param manga_url
 * @param callback
 */
function getMangaJson(manga_url, opts, callback) {
    var dry = false;
    var dir = 'manga_json';
    var minDelay = 1000;
    if (opts['dry']) dry = opts['dry'];
    if (opts.json_directory) { dir = opts.json_directory; }
    if (opts['promise_delay']) minDelay = 1000;

    console.log("minDelay: " + minDelay);

    console.log('Downloading ' + manga_url + ' JSON...');
    console.time('download json' + manga_url);
    var mfs = new manga_scraper.MangaFoxScraper();
    var promise = mfs.getChapterUrlsPromise(manga_url);

    // STEP 1:
    promise.then( function(urls_titles) {

        //Debug
        //console.log(urls);
        //console.log(titles);

        var urls = urls_titles['urls'].sort(); // Sort urls before processing.
        var titles = urls_titles['titles'].reverse(); // Reverse titles to match sorted urls.

        var promises = [];

        urls.forEach(function (url) {
            promises.push(mfs.getPageNumbersPromise(url));
        });

        console.log('STEP 1 Complete');
        return [urls, titles, promises]; // Passed down.

    })// STEP 2:
        .spread( function (urls, titles, promises) {

            var chapter_urls = urls;
            var temp_page_urls = [];
            var chapter_page_urls = [];

            return Promise.all(promises).then( function (page_numbers) { // Passed Down.
                if (urls.length === page_numbers.length) {
                    for (var i = 0; i < page_numbers.length; i++) {
                        // Old
                        var url = new URI(urls[i]); // ==> 'http://mangafox.me/manga/azure_dream/v01/c001/1.html' ...

                        // Set chapter urls.
                        temp_page_urls.push(path.dirname(url.toString()) + '/') // ==> ... http://mangafox.me/manga/azure_dream/v01/c007/ ...
                    }
                } else {
                    var message = 'chapter_urls and chapter_page_numbers length not equal for this manga.';
                    throw new mfs.ChaptersPagesNotEqualException(message, urls);
                }

                var ext = '.html';
                for (i = 0; i < temp_page_urls.length; i++) { // chapter_urls.length == page_numbers.length.
                    var chapter_pages = []
                    for (var j = 0; j < page_numbers[i].length; j++) {
                        chapter_pages.push(temp_page_urls[i] + page_numbers[i][j] + ext); // ==> http://mangafox.me/manga/azure_dream/v01/c001/1.html .. 2.html .. 3.html ..
                    }
                    chapter_page_urls.push(chapter_pages);
                }
            }).then( function() {
                //Debug
                //console.log(chapter_urls);
                //console.log(chapter_page_urls);
                console.log('STEP 2 Complete');
                return [chapter_urls, chapter_page_urls, titles]; // Passed down.
            })

        })
        .spread( function (chapter_urls, chapter_page_urls, titles){
            var promises = [];

            // Gather promises for image downloads that failed previously.
            for (var i = 0; i < chapter_page_urls.length; i++) {
                var chapter = manga_scraper.getChapterFromUrl(chapter_page_urls[i][0]);
                var volume = manga_scraper.getVolumeFromUrl(chapter_page_urls[i][0]);
                for (var j = 0; j < chapter_page_urls[i].length; j++) {
                    var opts = {'volume': volume, 'chapter': chapter, 'chapter_array_aligned': i,
                        'page': (j+1), 'page_array_aligned': (j)};

                    promises.push(Promise.delay(minDelay).return(mfs.getImageUrlPromise(chapter_page_urls[i][j], opts)))

                }
            }

            return Promise.settle(promises).then( function (image_urls) {
                var chapter_image_urls = [];

                // rejections['_settledValue']['volume']
                // rejections['_settledValue']['chapter']
                // rejections['_settledValue']['chapter_array_aligned']
                // rejections['_settledValue']['page']
                // rejections['_settledValue']['page_array_aligned']
                // rejections['_settledValue']['url']
                var rejections = image_urls.filter(function(el){ return el.isRejected(); });

                // Initialize Arrays;
                for (i = 0; i < chapter_page_urls.length; i++) {
                    chapter_image_urls[i] = [];
                }

                var last = null;
                for (var chapter_count = 0, i = 0; i < image_urls.length; i++) {
                    var curr = image_urls[i]['_settledValue']['chapter'];

                    if (i > 0) { last = image_urls[i-1]['_settledValue']['chapter'];
                    } else { last = image_urls[i]['_settledValue']['chapter']; }

                    if (curr != last) {
                        last = curr;
                        chapter_count++;
                    }
                    chapter_image_urls[chapter_count].push(image_urls[i]['_settledValue']['src']);
                }

                // Debug
                //console.log('Rejections:');
                //console.log(rejections);
                //console.log('image_urls:');
                //console.log(image_urls);
                console.log('chapter_image_urls:');
                console.log(chapter_image_urls);

                // Passed down.
                return [chapter_urls, chapter_page_urls, chapter_image_urls, rejections, titles]
            })

        })
        .spread( function(chapter_urls, chapter_page_urls, chapter_image_urls, rejections, titles) {
            var promises = [];

            // Gather promises of failed downloads.
            for (var i = 0; i < rejections.length; i++) {
                var volume = rejections[i]['_settledValue']['volume'];
                var chapter = rejections[i]['_settledValue']['chapter'];
                var chapter_array_aligned = rejections[i]['_settledValue']['chapter_array_aligned'];
                var page = rejections[i]['_settledValue']['page'];
                var page_array_aligned = rejections[i]['_settledValue']['page_array_aligned'];
                var url = rejections[i]['_settledValue']['url'];

                var opts = {
                    'volume': volume,
                    'chapter': chapter,
                    'chapter_array_aligned': chapter_array_aligned,
                    'page': page,
                    'page_array_aligned': page_array_aligned
                };
                promises.push(mfs.getImageUrlPromise(chapter_page_urls[i][j], opts));
            }

            // Retry downloading failed downloads.
            Promise.all(promises).then(function (rejected_image_urls) {

                // Debug
                console.log('rejected_images_urls: ');
                console.log(rejected_image_urls);

                // Finally build or mangafox object with all references to each page of each chapter of each volume, etc.
                var mangafox = new manga_scraper.MangaFox(manga_url, chapter_urls, chapter_image_urls, titles);

                // Add the missing/failed pages.
                // mangafox['volumes']['volume']['chapter']['img'][i]
                for (var i = 0; i < rejected_image_urls.length; i++) {
                    var volume = rejected_image_urls[i]['volume'];
                    var chapter = rejected_image_urls[i]['chapter'];
                    var page = rejected_image_urls[i]['page_array_aligned'];
                    //mangafox.volumes.volume.chapter.img[i] = src
                    mangafox['volumes'][volume][chapter]['img'][page] = rejected_image_urls[i]['src'];
                }

                // Debug.
                console.log('Mangafox Object:');
                console.log(mangafox);

                if (dry) {
                    console.log('Dry run. JSON not saved');
                    console.timeEnd('download json' + manga_url);
                    console.log('\n\n');
                    callback(true);
                } else {
                    // Save file.
                    manga_scraper.saveMangaAsJson(mangafox, dir, function(done) {
                        console.timeEnd('download json' + manga_url);
                        console.log('\n\n');
                        if (done) callback(true);
                    });
                }

            });

        }).catch(function (err) {
            console.log(err);
        });
}

/**
 *
 * @param json_file
 * @param opts
 * @param callback
 */
function updateMangaJson(json_file, opts, callback) {
    // Defaults
    var dry = false;
    if (opts.dry) dry = opts.dry;

    var mfs = new manga_scraper.MangaFoxScraper();
    var manga_json = loadJSON(json_file);
    var manga_url = manga_json['manga_url'];
    var chapter_urls_promise = mfs.getChapterUrlsPromise(manga_url);

    chapter_urls_promise.then( function(titles_chapter_urls) {
        var manga_name = manga_json['manga_name'];
        var old_chapters_urls = manga_json['chapter_urls'].sort();
        var new_chapters_urls = titles_chapter_urls['urls'].sort(); // caseInsensitive to true.
        var titles = titles_chapter_urls['titles'].reverse();
        var new_titles = [];
        var promises = [];
        // Update chapter_urls
        manga_json['chapter_urls'] = new_chapters_urls;

        var update_chapters = getNonDuplicates(old_chapters_urls, new_chapters_urls);

        if (!update_chapters) {
            var message = 'No chapters to update for ' + json_file ;
            throw new NoChaptersToUpdateException(message, [json_file]);
        }

        manga_json['chapter_urls'] = new_chapters_urls;

        if (titles.length != new_chapters_urls.length) {
            var message = 'New Chapters and titles length are not equal. Something may have happened with the web requests.';
            throw new manga_scraper.ChaptersTitlesLengthNotEqual(message, [new_chapters_urls, titles]);
        }

        var title_url = {};
        for (var i = 0; i < titles.length; i++) {
            title_url[new_chapters_urls[i]] = titles[i];
        }
        for (i = 0; i < update_chapters.length; i++) {
            new_titles.push(title_url[update_chapters[i]]);
        }

        // Debug
        //console.log(old_chapters_urls);
        //console.log(new_chapters_urls);
        //console.log(titles);
        console.log('New: ');
        console.log(update_chapters);
        console.log(new_titles);
        //console.log(manga_json);

        update_chapters.forEach(function(url) {
            promises.push(mfs.getPageNumbersPromise(url));
        });

        console.log('Updating ' + manga_url + ' JSON...');
        console.time('update json' + manga_url);

        console.log('Before: ');
        console.log(manga_json);

        return Promise.all(promises).then( function(page_numbers) {
            var chapter_page_urls = [];
            var temp_page_urls = [];

            if (update_chapters.length === page_numbers.length) {
                for (var i = 0; i < page_numbers.length; i++) {
                    // Old
                    var url = new URI(update_chapters[i]); // ==> 'http://mangafox.me/manga/azure_dream/v01/c001/1.html' ...

                    // Set chapter urls.
                    temp_page_urls.push(path.dirname(url.toString()) + '/') // ==> ... http://mangafox.me/manga/azure_dream/v01/c007/ ...
                }
            } else {
                var message = 'chapter_urls and chapter_page_numbers length not equal for this manga.';
                var args = {'update_chapters': update_chapters};
                throw new manga_scraper.ChaptersPagesNotEqualException(message, args);
            }
            var ext = '.html';
            for (i = 0; i < temp_page_urls.length; i++) { // chapter_urls.length == page_numbers.length.
                var chapter_pages = [];
                for (var j = 0; j < page_numbers[i].length; j++) {
                    chapter_pages.push(temp_page_urls[i] + page_numbers[i][j] + ext); // ==> http://mangafox.me/manga/azure_dream/v01/c001/1.html .. 2.html .. 3.html ..
                }
                chapter_page_urls.push(chapter_pages);
            }

            return [update_chapters, chapter_page_urls, new_titles]; // Passed down.

        })
    })
        .spread( function( chapter_urls, chapter_page_urls, titles) {
            var promises = [];

            //Debug
            //console.log(chapter_urls);
            //console.log(chapter_page_urls);
            //console.log(titles);

            // Gather promises for image downloads that failed previously.
            for (var i = 0; i < chapter_page_urls.length; i++) {
                var chapter = manga_scraper.getChapterFromUrl(chapter_page_urls[i][0]);
                var volume = manga_scraper.getVolumeFromUrl(chapter_page_urls[i][0]);
                for (var j = 0; j < chapter_page_urls[i].length; j++) {
                    var opts = {'volume': volume, 'chapter': chapter, 'chapter_array_aligned': i,
                        'page': (j+1), 'page_array_aligned': (j)};

                    promises.push(mfs.getImageUrlPromise(chapter_page_urls[i][j], opts));

                }
            }

            return Promise.settle(promises).then( function (image_urls) {
                var chapter_image_urls = [];
                // rejections['_settledValue']['volume']
                // rejections['_settledValue']['chapter']
                // rejections['_settledValue']['chapter_array_aligned']
                // rejections['_settledValue']['page']
                // rejections['_settledValue']['page_array_aligned']
                // rejections['_settledValue']['url']
                var rejections = image_urls.filter(function(el){ return el.isRejected(); });

                // Debug
                //console.log('Rejections:');
                //console.log(rejections);

                // Debug
                //console.log('image_urls:');
                //console.log(image_urls);

                // Initialize Arrays;
                for (i = 0; i < chapter_page_urls.length; i++) {
                    chapter_image_urls[i] = [];
                }

                var last = null;
                for (var chapter_count = 0, i = 0; i < image_urls.length; i++) {
                    var curr = image_urls[i]['_settledValue']['chapter'];

                    if (i > 0) { last = image_urls[i-1]['_settledValue']['chapter'];
                    } else { last = image_urls[i]['_settledValue']['chapter']; }

                    if (curr != last) {
                        last = curr;
                        chapter_count++;
                    }
                    chapter_image_urls[chapter_count].push(image_urls[i]['_settledValue']['src']);
                }

                // Passed down.
                return [chapter_urls, chapter_page_urls, chapter_image_urls, rejections, titles];
            });

        })
        .spread( function(chapter_urls, chapter_page_urls, chapter_image_urls, rejections, titles) {
            var promises = [];

            // Gather promises of failed downloads.
            for (var i = 0; i < rejections.length; i++) {
                var volume = rejections[i]['_settledValue']['volume'];
                var chapter = rejections[i]['_settledValue']['chapter'];
                var chapter_array_aligned = rejections[i]['_settledValue']['chapter_array_aligned'];
                var page = rejections[i]['_settledValue']['page'];
                var page_array_aligned = rejections[i]['_settledValue']['page_array_aligned'];
                var url = rejections[i]['_settledValue']['url'];

                var opts = {
                    'volume': volume,
                    'chapter': chapter,
                    'chapter_array_aligned': chapter_array_aligned,
                    'page': page,
                    'page_array_aligned': page_array_aligned
                };

                promises.push(mfs.getImageUrlPromise(url, opts));
            }

            // Retry downloading failed downloads.
            Promise.all(promises).then(function (rejected_images) {

                //Debug
                //console.log(chapter_urls);
                //console.log(chapter_page_urls);
                //console.log(chapter_image_urls);
                //console.log(rejections);
                //console.log(titles);

                // Debug
                //console.log('rejected_images: ');
                //console.log(rejected_images);

                // Debug.
                //console.log('chapter_urls: ' + chapter_urls.length);
                //console.log('chapter_image_urls: ' + chapter_image_urls.length);
                //console.log('titles: ' + titles.length);
                //console.log(chapter_image_urls);
                if (titles.length != chapter_urls.length) {
                    var message = 'Chapters and titles length are not equal. Something may have happened with the web requests.';
                    throw new ChaptersTitlesLengthNotEqual(message, [chapter_urls, titles, chapter_image_urls]);
                }

                // Set volumes and chapters for each src url.
                for (var i = 0; i < (chapter_image_urls.length); i++) {
                    if ( manga_json['volumes'][manga_scraper.getVolumeFromUrl(chapter_urls[i])] != null ) { // Add volume to chapter.
                        manga_json['volumes'][manga_scraper.getVolumeFromUrl(chapter_urls[i])][manga_scraper.getChapterFromUrl(chapter_urls[i])] = {'title': titles[i], 'img': chapter_image_urls[i]};
                    } else { // Initialize the volume.
                        manga_json['volumes'][manga_scraper.getVolumeFromUrl(chapter_urls[i])] = {};
                        manga_json['volumes'][manga_scraper.getVolumeFromUrl(chapter_urls[i])][manga_scraper.getChapterFromUrl(chapter_urls[i])] = {'title': titles[i], 'img': chapter_image_urls[i]};
                    }
                }

                manga_json['volumes']['length'] = manga_scraper.count(manga_json['volumes']-1); // -1 because of length

                // Add the missing/failed pages.
                // mangafox['volumes']['volume']['chapter']['img'][i]
                for (i = 0; i < rejected_images.length; i++) {
                    var volume = rejected_images[i]['volume'];
                    var chapter = rejected_images[i]['chapter'];
                    var page = rejected_images[i]['page_array_aligned'];
                    //mangafox.volumes.volume.chapter.img[i] = src
                    manga_json['volumes'][volume][chapter]['img'][page] = rejected_images[i]['src'];
                }

                // Debug.
                console.log('After: ');
                console.log(manga_json);


                // Save file.
                if (dry) {
                    console.log('Dry run. JSON not saved');
                    callback(true);
                } else {
                    saveFileSync(json_file, manga_json);
                    console.timeEnd('update json' + manga_url);
                    console.log('\n\n');
                    callback(true);
                }

            });

        })
        .catch(function (err) {
            console.log(err);
            console.log(err.message + '\n\n');
            callback(false);
        });

    function loadJSON(json_file) {
        try {
            // Default encoding is utf8.
            if (typeof (encoding) == 'undefined') { encoding = 'utf8'; }

            // Read file synchronously.
            var contents = fs.readFileSync(json_file, encoding);

            // Parse contents as JSON,
            return JSON.parse(contents);

        } catch (err) {
            throw err;
        }
    }

    /**
     * Save data as JSON. Synchronous.
     *
     * @param file
     * @param directory
     */
    function saveFileSync(file_name, data) {
        try {
            // Debug
            console.log('Saving JSON file... ' + file_name);
            jsonfile.writeFileSync(file_name, data);

        }
        catch (err) {
            console.log(err);
        }
    }

    /**
     * input [1,2,3], [1,2,3,4,5,6]
     * output [4,5,6]
     *
     * Get the non duplicates between an old array and an updated array of the old array.
     * Arrays must be sorted and be the same up to the the second array[first_array.length].
     *
     * Returns false if the arrays length match.
     *
     * @param array1
     * @param array2
     * @returns *
     */
    function getNonDuplicates(array1, array2) {
        var new_items = [];
        if (array1.length == array2.length) {

            return false;
        } else {
            try {
                if (array2.length > array1.length) {

                    for (var i = 0, j = 0; i < array2.length; i++) {
                        if (array1[j]) {
                            if (array1[j] != array2[i]) {
                                new_items.push(array2[i]);
                            }
                            j++;
                        } else {
                            new_items.push(array2[i]);
                        }
                    }
                    return new_items;
                } else {
                    var args = {'array1_length': array1.length, 'array2_length': array2.length};

                    throw new manga_scraper.Array2LenMustBeGreaterException('array2 must have greater length than array1.', args);
                }
            } catch(err) {
                console.log(err);
            }
        }
    }
}

/*
 Exceptions
 */
function NoChaptersToUpdateException(message, args) {
    this.args = args;
    this.message = message;
    this.name = 'NoChaptersToUpdateException';
}