import axios from "axios";
import React from "react";
import HotKeys from "react-hot-keys";
import { sortBy } from "lodash";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugin/wavesurfer.regions.min.js";
import TimelinePlugin from "wavesurfer.js/dist/plugin/wavesurfer.timeline.min.js";
import { Helmet } from "react-helmet";
import { withRouter } from "react-router-dom";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSearchMinus,
  faSearchPlus,
  faBackward,
  faForward,
  faPlayCircle,
  faPauseCircle,
} from "@fortawesome/free-solid-svg-icons";
import Alert from "../components/alert";
import { IconButton, Button } from "../components/button";
import Loader from "../components/loader";

class Annotate extends React.Component {
  constructor(props) {
    super(props);

    const projectId = Number(this.props.match.params.projectid);
    const dataParams = this.props.match.params.dataid.split("&");
    const dataId = Number(dataParams[0]);
    const fileName = dataParams[1];
    const youtubeId = dataParams[1]
      .split(".")[0]
      .substr(0, fileName.lastIndexOf("_"));
    const youtubeStartTime = Math.floor(Number(dataParams[2]) / 1000);
    const page = Number(dataParams[3]) || 1;
    const active = dataParams[4] || "pending";

    this.state = {
      isPlaying: false,
      projectId,
      dataId,
      data: [],
      fileName,
      youtubeId,
      active: active,
      count: {
        pending: 0,
        completed: 0,
        all: 0,
        marked_review: 0,
      },
      nextPage: null,
      prevPage: null,
      page: page, // TODO: get from url
      apiUrl: `/api/current_user/projects/${projectId}/data`,
      labels: {},
      labelsUrl: `/api/projects/${projectId}/labels`,
      dataUrl: `/api/projects/${projectId}/data/${dataId}`,
      segmentationUrl: `/api/projects/${projectId}/data/${dataId}/segmentations`,
      isDataLoading: false,
      wavesurfer: null,
      zoom: 100,
      referenceTranscription: null,
      isMarkedForReview: false,
      selectedSegment: null,
      isSegmentSaving: false,
      isSegmentDeleting: false,
      errorMessage: null,
      successMessage: null,
      youtubeStartTime,
      previousItemAvailable: false,
      nextItemAvailable: false,
      previousItemPage: null,
      nextItemPage: null,
      previousDataId: null,
      previousFileName: null,
      previousYoutubeStartTime: null,
      nextDataId: null,
      nextFileName: null,
      nextYoutubeStartTime: null,
    };

    this.labelRef = {};
    this.transcription = null;
  }

  async componentDidMount() {
    const { labelsUrl, dataUrl } = this.state;
    this.setState({ isDataLoading: true });
    let { apiUrl, page, active } = this.state;
    let url = `${apiUrl}?page=${page}&active=${active}`;

    try {
      const response = await axios({
        method: "get",
        url,
      });

      const {
        data,
        count,
        active: activeS,
        page: pageS,
        next_page: nextPage,
        prev_page: prevPage,
      } = response.data;
      const sortedData = sortBy(data, d => {
        const ext = d['original_filename'].split('.')[1]
        const temp = d['original_filename'].split('.')[0].split('_')
        const fname = temp.slice(0, temp.length - 1)
        const index = temp[temp.length - 1]
        const zeroPaddedFname = `${fname.join("_")}_${index.padStart(5, '0')}.${ext}`
        return zeroPaddedFname
      });

      const currentIdx = sortedData.findIndex(
        (d) => d["data_id"] === this.state.dataId
      );

      // update the current page
      localStorage.setItem(`${activeS}:page`, pageS);

      // end of the page or cannot find the data
      if (currentIdx === -1 || currentIdx === sortedData.length - 1) {
        // if there is a next page, load the next page
        if (nextPage) {
          this.setState({ isDataLoading: true });
          url = `${apiUrl}?page=${page + 1}&active=${active}`;

          const response = await axios({
            method: "get",
            url,
          });

          const {
            data,
          } = response.data;

          const sortedDataNext = sortBy(data, d => {
            const ext = d['original_filename'].split('.')[1]
            const temp = d['original_filename'].split('.')[0].split('_')
            const fname = temp.slice(0, temp.length - 1)
            const index = temp[temp.length - 1]
            const zeroPaddedFname = `${fname.join("_")}_${index.padStart(5, '0')}.${ext}`
            return zeroPaddedFname
          });

          this.setState({
            data: sortedData,
            count,
            active: activeS,
            page: pageS,
            nextPage: nextPage,
            prevPage: prevPage,
            isDataLoading: false,
            // set the previous item to the second last item of the current page
            previousItemPage: pageS, // this is the page of the previous item
            nextItemPage: pageS + 1, // this is the page of the next item
            previousDataId: sortedData[sortedData.length - 2]["data_id"],
            previousFileName: sortedData[sortedData.length - 2]["original_filename"],
            previousYoutubeStartTime: sortedData[sortedData.length - 2]["youtube_start_time"],
            previousItemAvailable: true,
            // set the next item to the first item of the next page
            nextDataId: sortedDataNext[0]["data_id"],
            nextFileName: sortedDataNext[0]["original_filename"],
            nextYoutubeStartTime: sortedDataNext[0]["youtube_start_time"],
            nextItemAvailable: true,
          });
          // if there is no next page, set the next item to null
        } else {
          this.setState({
            data: sortedData,
            count,
            active: activeS,
            page: pageS,
            isDataLoading: false,
            nextPage: null,
            nextDataId: null,
            nextFileName: null,
            nextItemPage: null,
            nextYoutubeStartTime: null,
            nextItemAvailable: false,
            // set the previous item to the second last item of the current page
            previousItemPage: page, // this is the page of the previous item
            previousDataId: sortedData[sortedData.length - 2]["data_id"],
            previousFileName: sortedData[sortedData.length - 2]["original_filename"],
            previousYoutubeStartTime: sortedData[sortedData.length - 2]["youtube_start_time"],
            previousItemAvailable: true,
          });
        }
        // if the current item is the first item of the page
      } else if (currentIdx === 0) {
        // if there is a previous page, load the previous page
        if (prevPage) {
          this.setState({ isDataLoading: true });
          url = `${apiUrl}?page=${page - 1}&active=${active}`;

          const response = await axios({
            method: "get",
            url,
          });

          const {
            data,
          } = response.data;

          const sortedDataPrev = sortBy(data, d => {
            const ext = d['original_filename'].split('.')[1]
            const temp = d['original_filename'].split('.')[0].split('_')
            const fname = temp.slice(0, temp.length - 1)
            const index = temp[temp.length - 1]
            const zeroPaddedFname = `${fname.join("_")}_${index.padStart(5, '0')}.${ext}`
            return zeroPaddedFname
          });

          // set the next item to the second item of the current page
          const nextData = sortedData[currentIdx + 1];

          this.setState({
            isDataLoading: false,
            // set the previous item to the second last item of the current page
            previousItemPage: page - 1, // this is the page of the previous item
            previousDataId: sortedDataPrev[sortedDataPrev.length - 1]["data_id"],
            previousFileName: sortedDataPrev[sortedDataPrev.length - 1]["original_filename"],
            previousYoutubeStartTime: sortedDataPrev[sortedDataPrev.length - 1]["youtube_start_time"],
            previousItemAvailable: true,
            data,
            count,
            active: activeS,
            page: pageS,
            nextPage: nextPage,
            prevPage: prevPage,
            nextItemPage: pageS, // this is the page of the next item
            nextDataId: nextData["data_id"],
            nextFileName: nextData["original_filename"],
            nextYoutubeStartTime: nextData["youtube_start_time"],
            nextItemAvailable: true,
          });
          // if this is the first item of the first page, set the previous item to null
        } else {

          // set the next item to the second item of the current page
          const nextData = sortedData[currentIdx + 1];

          this.setState({
            previousItemAvailable: false,
            previousItemPage: null,
            previousDataId: null,
            previousFileName: null,
            previousYoutubeStartTime: null,
            data,
            count,
            active: activeS,
            page: pageS,
            nextPage: nextPage,
            prevPage: prevPage,
            nextItemPage: pageS, // this is the page of the next item
            nextDataId: nextData["data_id"],
            nextFileName: nextData["original_filename"],
            nextYoutubeStartTime: nextData["youtube_start_time"],
            nextItemAvailable: true,
          });
        }
        // if the current item is neither the first nor the last item of the page
      } else {

        const nextData = sortedData[currentIdx + 1];
        const prevData = sortedData[currentIdx - 1];

        this.setState({
          data,
          count,
          active: activeS,
          page: pageS,
          nextPage: nextPage,
          prevPage: prevPage,
          isDataLoading: false,
          nextItemPage: pageS, // this is the page of the next item
          nextDataId: nextData["data_id"],
          nextFileName: nextData["original_filename"],
          nextYoutubeStartTime: nextData["youtube_start_time"],
          nextItemAvailable: true,
          previousItemPage: page, // this is the page of the previous item
          previousDataId: prevData["data_id"],
          previousFileName: prevData["original_filename"],
          previousYoutubeStartTime: prevData["youtube_start_time"],
          previousItemAvailable: true,
        });
      }
    } catch (error) {
      this.setState({
        errorMessage: error.message,
        isDataLoading: false,
      });
    }

    const wavesurfer = WaveSurfer.create({
      container: "#waveform",
      barWidth: 2,
      barHeight: 1,
      barGap: null,
      mediaControls: false,
      plugins: [
        RegionsPlugin.create(),
        TimelinePlugin.create({ container: "#timeline" }),
      ],
    });
    this.showSegmentTranscription(null);
    this.props.history.listen((location, action) => {
      wavesurfer.stop();
    });
    wavesurfer.on("ready", () => {
      wavesurfer.enableDragSelection({ color: "rgba(0, 102, 255, 0.3)" });
      // Check if there is no region, if so, add a region for the whole audio
      if (!Object.keys(wavesurfer.regions.list).length) {
        wavesurfer.addRegion({
          start: 0,
          end: wavesurfer.getDuration(),
        });

        const firstRegionKey = Object.keys(wavesurfer.regions.list)[0];
        this.setState({
          selectedSegment: wavesurfer.regions.list[firstRegionKey],
        });
      }
    });
    wavesurfer.on("region-in", (region) => {
      this.showSegmentTranscription(region);
    });
    wavesurfer.on("region-out", () => {
      this.showSegmentTranscription(null);
    });

    wavesurfer.on("region-play", (r) => {
      r.once("out", () => {
        wavesurfer.play(r.start);
        wavesurfer.pause();
      });
    });

    wavesurfer.on("region-click", (r, e) => {
      e.stopPropagation();
      this.setState({
        isPlaying: true,
        selectedSegment: r,
      });
      r.once("out", () => {
        wavesurfer.play(r.start);
        wavesurfer.pause();
      });
      wavesurfer.play(r.start);  // temp fix for region not playing to the end issue
    });
    wavesurfer.on("pause", (r, e) => {
      this.setState({ isPlaying: false });
    });

    axios
      .all([axios.get(labelsUrl), axios.get(dataUrl)])
      .then((response) => {
        this.setState({
          isDataLoading: false,
          labels: response[0].data,
        });

        const {
          reference_transcription,
          is_marked_for_review,
          segmentations,
          filename,
        } = response[1].data;

        const regions = segmentations.map((segmentation) => {
          return {
            start: segmentation.start_time,
            end: segmentation.end_time,
            data: {
              segmentation_id: segmentation.segmentation_id,
              transcription: segmentation.transcription,
              annotations: segmentation.annotations,
            },
          };
        });

        this.setState({
          isDataLoading: false,
          referenceTranscription: reference_transcription,
          isMarkedForReview: is_marked_for_review,
          filename,
        });

        wavesurfer.load(`/audios/${filename}`);
        wavesurfer.drawBuffer();
        const { zoom } = this.state;
        wavesurfer.zoom(zoom);

        this.setState({ wavesurfer });

        this.loadRegions(regions);
        if (regions.length > 0) {
          this.setState({
            selectedSegment: wavesurfer.regions.list[Object.keys(wavesurfer.regions.list)[0]],
          })
        }
      })
      .catch((error) => {
        console.log(error);
        this.setState({
          isDataLoading: false,
        });
      });
  }

  loadRegions(regions) {
    const { wavesurfer } = this.state;
    regions.forEach((region) => {
      wavesurfer.addRegion(region);
    });
  }

  showSegmentTranscription(region) {
    this.segmentTranscription.textContent =
      (region && region.data.transcription) || "–";
  }

  onKeyUp(keyName, e, handle) {
    e.preventDefault()
  }

  onKeyDown(keyName, e, handle) {
    e.preventDefault()
    switch (keyName) {
      case "space":
        if (this.state.isPlaying) {
          this.handlePause();
        } else {
          this.handlePlay();
        }
        break;
      case "ctrl+left":
      case "command+left":
        this.handleBackward();
        break;
      case "ctrl+right":
      case "command+right":
        this.handleForward();
        break;
      case "ctrl+shift+left":
      case "command+shift+left":
        this.handleBackward(1);
        break;
      case "ctrl+shift+right":
      case "command+shift+right":
        this.handleForward(1);
        break;
      case "ctrl+up":
      case "command+up":
        if (this.state.nextItemAvailable && !this.state.isSegmentSaving && !this.state.isSegmentDeleting) {
          this.props.history.push(`/projects/${this.state.projectId
            }/data/${`${this.state.nextDataId}&${this.state.nextFileName}&${this.state.nextYoutubeStartTime}&${this.state.nextItemPage}&${this.state.active}`}/annotate`)
          window.location.reload(false);
        }
        break;
      case "ctrl+down":
      case "command+down":
        if (this.state.previousItemAvailable && !this.state.isSegmentSaving && !this.state.isSegmentDeleting) {
          this.props.history.push(`/projects/${this.state.projectId
            }/data/${`${this.state.previousDataId}&${this.state.previousFileName}&${this.state.previousYoutubeStartTime}&${this.state.previousItemPage}&${this.state.active}`}/annotate`)
          window.location.reload(false);
        }
        break;
      case "ctrl+s":
      case "command+s":
        if (!this.state.isSegmentSaving && !this.state.isSegmentDeleting) {
          this.handleSegmentSave();
        }
        break;
      case "ctrl+shift+s":
      case "command+shift+s":
        if (!this.state.isSegmentSaving && !this.state.isSegmentDeleting) {
          this.handleSkipFile();
        }
        break;
      default:
        break;
    }
  }

  handlePlay() {
    const { wavesurfer } = this.state;
    this.setState({ isPlaying: true });
    wavesurfer.play();
  }

  handlePause() {
    const { wavesurfer } = this.state;
    this.setState({ isPlaying: false });
    wavesurfer.pause();
  }

  handleForward(time = 5) {
    const { wavesurfer } = this.state;
    wavesurfer.skipForward(time);
    wavesurfer.pause();
  }

  handleBackward(time = 5) {
    const { wavesurfer } = this.state;
    wavesurfer.skipBackward(time);
    wavesurfer.pause();
  }

  handleZoom(e) {
    const { wavesurfer } = this.state;
    const zoom = Number(e.target.value);
    wavesurfer.zoom(zoom);
    this.setState({ zoom });
  }

  handleIsMarkedForReview(e) {
    const { dataUrl } = this.state;
    const isMarkedForReview = e.target.checked;
    this.setState({ isDataLoading: true });

    axios({
      method: "patch",
      url: dataUrl,
      data: {
        is_marked_for_review: isMarkedForReview,
      },
    })
      .then((response) => {
        this.setState({
          isDataLoading: false,
          isMarkedForReview: response.data.is_marked_for_review,
          errorMessage: null,
          successMessage: "Marked for review status changed",
        });
      })
      .catch((error) => {
        console.log(error);
        this.setState({
          isDataLoading: false,
          errorMessage: "Error changing review status",
          successMessage: null,
        });
      });
  }

  handleSegmentDelete() {
    const { wavesurfer, selectedSegment, segmentationUrl } = this.state;
    this.setState({ isSegmentDeleting: true });
    if (selectedSegment.data.segmentation_id) {
      axios({
        method: "delete",
        url: `${segmentationUrl}/${selectedSegment.data.segmentation_id}`,
      })
        .then((response) => {
          wavesurfer.regions.list[selectedSegment.id].remove();
          this.setState({
            selectedSegment: null,
            isSegmentDeleting: false,
          });
        })
        .catch((error) => {
          console.log(error);
          this.setState({
            isSegmentDeleting: false,
          });
        });
    } else {
      wavesurfer.regions.list[selectedSegment.id].remove();
      this.setState({
        selectedSegment: null,
        isSegmentDeleting: false,
      });
    }
  }

  handleSkipFile(e) {
    const { selectedSegment, segmentationUrl, nextItemAvailable } = this.state;

    const {
      segmentation_id = null,
    } = selectedSegment.data;

    this.setState({ isSegmentSaving: true });

    if (segmentation_id === null) {
      axios({
        method: "post",
        url: segmentationUrl,
        data: {
          start: 0,
          end: this.state.wavesurfer.getDuration(),
          transcription: "*skipped_file*",
          annotations: undefined,
        },
      })
        .then((response) => {
          const { segmentation_id } = response.data;
          selectedSegment.data.segmentation_id = segmentation_id;
          this.setState({
            isSegmentSaving: false,
            selectedSegment,
            successMessage: "Segment saved",
            errorMessage: null,
          });
          if (nextItemAvailable) {
            this.props.history.push(`/projects/${this.state.projectId
              }/data/${`${this.state.nextDataId}&${this.state.nextFileName}&${this.state.nextYoutubeStartTime}&${this.state.nextItemPage}&${this.state.active}`}/annotate`)
            window.location.reload(false);
          }
        })
        .catch((error) => {
          console.log(error);
          this.setState({
            isSegmentSaving: false,
            errorMessage: "Error saving segment",
            successMessage: null,
          });
        });
    } else {
      axios({
        method: "put",
        url: `${segmentationUrl}/${segmentation_id}`,
        data: {
          start: 0,
          end: this.state.wavesurfer.getDuration(),
          transcription: "*skipped_file*",
          annotations: undefined,
        },
      })
        .then((response) => {
          this.setState({
            isSegmentSaving: false,
            successMessage: "Segment saved",
            errorMessage: null,
          });

          if (nextItemAvailable) {
            this.props.history.push(`/projects/${this.state.projectId
              }/data/${`${this.state.nextDataId}&${this.state.nextFileName}&${this.state.nextYoutubeStartTime}&${this.state.nextItemPage}&${this.state.active}`}/annotate`)
            window.location.reload(false);
          }
        })
        .catch((error) => {
          console.log(error);
          this.setState({
            isSegmentSaving: false,
            errorMessage: "Error saving segment",
            successMessage: null,
          });
        });
    }
  }

  handleSegmentSave(e) {
    const { selectedSegment, segmentationUrl } = this.state;
    const { start, end } = selectedSegment;

    const {
      transcription,
      annotations,
      segmentation_id = null,
    } = selectedSegment.data;

    this.setState({ isSegmentSaving: true });

    if (segmentation_id === null) {
      axios({
        method: "post",
        url: segmentationUrl,
        data: {
          start,
          end,
          transcription,
          annotations,
        },
      })
        .then((response) => {
          const { segmentation_id } = response.data;
          selectedSegment.data.segmentation_id = segmentation_id;
          this.setState({
            isSegmentSaving: false,
            selectedSegment,
            successMessage: "Segment saved",
            errorMessage: null,
          });
        })
        .catch((error) => {
          console.log(error);
          this.setState({
            isSegmentSaving: false,
            errorMessage: "Error saving segment",
            successMessage: null,
          });
        });
    } else {
      axios({
        method: "put",
        url: `${segmentationUrl}/${segmentation_id}`,
        data: {
          start,
          end,
          transcription,
          annotations,
        },
      })
        .then((response) => {
          this.setState({
            isSegmentSaving: false,
            successMessage: "Segment saved",
            errorMessage: null,
          });
        })
        .catch((error) => {
          console.log(error);
          this.setState({
            isSegmentSaving: false,
            errorMessage: "Error saving segment",
            successMessage: null,
          });
        });
    }
  }

  handleTranscriptionChange(e) {
    const { selectedSegment } = this.state;
    selectedSegment.data.transcription = e.target.value;
    this.setState({ selectedSegment });
  }

  handleLabelChange(key, e) {
    const { selectedSegment, labels } = this.state;
    selectedSegment.data.annotations = selectedSegment.data.annotations || {};
    if (labels[key]["type"] === "multiselect") {
      selectedSegment.data.annotations[key] = {
        label_id: labels[key]["label_id"],
        values: Array.from(e.target.selectedOptions, (option) => option.value),
      };
    } else {
      selectedSegment.data.annotations[key] = {
        label_id: labels[key]["label_id"],
        values: e.target.value,
      };
    }
    this.setState({ selectedSegment });
  }

  handleAlertDismiss(e) {
    e.preventDefault();
    this.setState({
      successMessage: "",
      errorMessage: "",
    });
  }

  render() {
    const {
      zoom,
      isPlaying,
      labels,
      isDataLoading,
      isMarkedForReview,
      referenceTranscription,
      selectedSegment,
      isSegmentDeleting,
      isSegmentSaving,
      errorMessage,
      successMessage,
      nextItemAvailable,
      previousItemAvailable,
    } = this.state;

    const keyMap = "ctrl+s,command+s,ctrl+up,ctrl+down,ctrl+left,ctrl+right,\
    ctrl+shift+left,ctrl+shift+right,command+shift+left,command+shift+right,\
    command+up,command+down,command+left,command+right,\
    ctrl+shift+s,command+shift+s,space"

    return (
      <HotKeys
        keyName={keyMap}
        onKeyDown={this.onKeyDown.bind(this)}
        onKeyUp={this.onKeyUp.bind(this)}
      >
        <Helmet>
          <title>Annotate</title>
        </Helmet>
        <div className="container h-100">
          <div className="h-100 mt-5 text-center">
            <h3>{this.state.fileName}</h3>
            {errorMessage ? (
              <Alert
                type="danger"
                message={errorMessage}
                onClose={(e) => this.handleAlertDismiss(e)}
              />
            ) : null}
            {successMessage ? (
              <Alert
                type="success"
                message={successMessage}
                onClose={(e) => this.handleAlertDismiss(e)}
              />
            ) : null}
            {isDataLoading ? <Loader /> : null}
            <div className="row justify-content-md-center my-4">
              <div ref={(el) => (this.segmentTranscription = el)}></div>
              <div id="waveform"></div>
              <div id="timeline"></div>
            </div>
            {!isDataLoading ? (
              <div>
                <div className="row justify-content-md-center my-4">
                  <div className="col-1">
                    <IconButton
                      icon={faBackward}
                      size="2x"
                      title="Skip Backward"
                      onClick={() => {
                        this.handleBackward();
                      }}
                    />
                  </div>
                  <div className="col-1">
                    {!isPlaying ? (
                      <IconButton
                        icon={faPlayCircle}
                        size="2x"
                        title="Play"
                        onClick={() => {
                          this.handlePlay();
                        }}
                      />
                    ) : null}
                    {isPlaying ? (
                      <IconButton
                        icon={faPauseCircle}
                        size="2x"
                        title="Pause"
                        onClick={() => {
                          this.handlePause();
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="col-1">
                    <IconButton
                      icon={faForward}
                      size="2x"
                      title="Skip Forward"
                      onClick={() => {
                        this.handleForward();
                      }}
                    />
                  </div>
                </div>
                <div className="row justify-content-center">
                  <div className="col-1">
                    <FontAwesomeIcon icon={faSearchMinus} title="Zoom out" />
                  </div>
                  <div className="col-2">
                    <input
                      type="range"
                      min="1"
                      max="200"
                      value={zoom}
                      onChange={(e) => this.handleZoom(e)}
                    />
                  </div>
                  <div className="col-1">
                    <FontAwesomeIcon icon={faSearchPlus} title="Zoom in" />
                  </div>
                </div>
                <div className="row justify-content-center my-4">
                  {referenceTranscription ? (
                    <div className="form-group">
                      <label className="font-weight-bold">
                        Reference Transcription
                      </label>
                      <textarea
                        className="form-control"
                        rows="3"
                        cols="50"
                        disabled={true}
                        value={referenceTranscription}
                      ></textarea>
                    </div>
                  ) : null}
                </div>
                {selectedSegment ? (
                  <div>
                    <div className="row justify-content-center my-4">
                      <div className="form-group">
                        <label className="font-weight-bold">
                          Segment Transcription
                        </label>
                        <textarea
                          className="form-control"
                          rows="3"
                          cols="50"
                          value={
                            (selectedSegment &&
                              selectedSegment.data.transcription) ||
                            ""
                          }
                          onChange={(e) => this.handleTranscriptionChange(e)}
                          ref={(el) => (this.transcription = el)}
                        ></textarea>
                      </div>
                    </div>
                    <div className="row justify-content-center my-4">
                      {Object.entries(labels).map(([key, value], index) => {
                        if (!value["values"].length) {
                          return null;
                        }
                        return (
                          <div className="col-3 text-left" key={index}>
                            <label htmlFor={key} className="font-weight-bold">
                              {key}
                            </label>

                            <select
                              className="form-control"
                              name={key}
                              multiple={
                                value["type"] === "multiselect" ? true : false
                              }
                              value={
                                (selectedSegment &&
                                  selectedSegment.data.annotations &&
                                  selectedSegment.data.annotations[key] &&
                                  selectedSegment.data.annotations[key][
                                  "values"
                                  ]) ||
                                (value["type"] === "multiselect" ? [] : "")
                              }
                              onChange={(e) => this.handleLabelChange(key, e)}
                              ref={(el) => (this.labelRef[key] = el)}
                            >
                              {value["type"] !== "multiselect" ? (
                                <option value="-1">Choose Label Type</option>
                              ) : null}
                              {value["values"].map((val) => {
                                return (
                                  <option
                                    key={val["value_id"]}
                                    value={`${val["value_id"]}`}
                                  >
                                    {val["value"]}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                    <div className="row justify-content-center my-8">
                      <div className="col-2">
                        <Button
                          size="lg"
                          type="danger"
                          disabled={isSegmentDeleting}
                          isSubmitting={isSegmentDeleting}
                          onClick={(e) => this.handleSegmentDelete(e)}
                          text="Delete"
                        />
                      </div>
                      <div className="col-2">
                        {/* <a href={`/projects/${this.state.projectId}/data`}>
                          <Button
                            size="lg"
                            type="primary"
                            disabled={isSegmentSaving}
                            text="Back to files"
                          />
                        </a> */}
                        {!isSegmentSaving && previousItemAvailable ? (
                          <a
                            href={`/projects/${this.state.projectId
                              }/data/${`${this.state.previousDataId}&${this.state.previousFileName}&${this.state.previousYoutubeStartTime}&${this.state.previousItemPage}&${this.state.active}`}/annotate`}
                          >
                            <Button size="lg" type="primary" text="Back" />
                          </a>
                        ) : (
                          <Button size="lg" type="danger" text="START" isDisabled={true} />
                        )}
                      </div>
                      <div className="col-2">
                        <Button
                          size="lg"
                          type="primary"
                          disabled={isSegmentSaving}
                          onClick={(e) => this.handleSegmentSave(e)}
                          isSubmitting={isSegmentSaving}
                          text="Save"
                        />
                      </div>
                      <div className="col-2">
                        {!isSegmentSaving && nextItemAvailable ? (
                          <a
                            href={`/projects/${this.state.projectId
                              }/data/${`${this.state.nextDataId}&${this.state.nextFileName}&${this.state.nextYoutubeStartTime}&${this.state.nextItemPage}&${this.state.active}`}/annotate`}
                          >
                            <Button size="lg" type="primary" text="Next" />
                          </a>
                        ) : (
                          <Button size="lg" type="danger" text="END" isDisabled={true} />
                        )}
                      </div>
                      <div className="col-2">
                        <Button size="lg" type="danger" text="Skip" isDisabled={isSegmentSaving} onClick={(e) => this.handleSkipFile(e)} />
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="row justify-content-center my-4">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="isMarkedForReview"
                      value={false}
                      checked={isMarkedForReview}
                      onChange={(e) => this.handleIsMarkedForReview(e)}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="isMarkedForReview"
                    >
                      Mark for review
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            {this.state.youtubeId ? (
              <div className="video-responsive">
                <iframe
                  width="853"
                  height="480"
                  src={`https://www.youtube.com/embed/${this.state.youtubeId}?start=${this.state.youtubeStartTime}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="Reference Video"
                />
              </div>
            ) : null}
          </div>
        </div>
      </HotKeys>
    );
  }
}

export default withRouter(Annotate);
