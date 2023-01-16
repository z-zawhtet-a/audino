import json
import sqlalchemy as sa
import uuid

from pathlib import Path

from flask import jsonify, flash, redirect, url_for, request, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.urls import url_parse
from werkzeug.utils import secure_filename
from werkzeug.exceptions import BadRequest, NotFound, InternalServerError

from backend import app, db
from backend.models import Data, Project, User, Segmentation, Label, LabelValue

from . import api

ALLOWED_EXTENSIONS = ["wav", "mp3", "ogg"]


@api.route("/audio/<path:file_name>", methods=["GET"])
@jwt_required
def send_audio_file(file_name):
    return send_from_directory(app.config["UPLOAD_FOLDER"], file_name)


def validate_segmentation(segment):
    """Validate the segmentation before accepting the annotation's upload from users
    """
    required_key = {"start_time", "end_time", "transcription"}

    if set(required_key).issubset(segment.keys()):
        return True
    else:
        return False


def generate_segmentation(
    annotations,
    transcription,
    project_id,
    start_time,
    end_time,
    data_id,
    segmentation_id=None,
):
    """Generate a Segmentation from the required segment information
    """
    if segmentation_id is None:
        segmentation = Segmentation(
            data_id=data_id,
            start_time=start_time,
            end_time=end_time,
            transcription=transcription,
        )
    else:
        # segmentation updated for existing data
        segmentation = Segmentation.query.filter_by(
            data_id=data_id, id=segmentation_id
        ).first()
        segmentation.set_start_time(start_time)
        segmentation.set_end_time(end_time)
        segmentation.set_transcription(transcription)

    db.session.add(segmentation)
    db.session.flush()

    values = []

    for label_name, val in annotations.items():
        label = Label.query.filter_by(name=label_name, project_id=project_id).first()

        if label is None:
            raise NotFound(description=f"Label not found with name: `{label_name}`")

        if "values" not in val:
            raise BadRequest(
                description=f"Key: `values` missing in Label: `{label_name}`"
            )

        label_values = val["values"]

        if isinstance(label_values, list):
            for val_id in label_values:

                value = LabelValue.query.filter_by(
                    id=int(val_id), label_id=int(label.id)
                ).first()

                if value is None:
                    raise BadRequest(
                        description=f"`{label_name}` does not have label value with id `{val_id}`"
                    )
                values.append(value)

        else:
            if label_values == "-1":
                continue

            value = LabelValue.query.filter_by(
                id=int(label_values), label_id=int(label.id)
            ).first()

            if value is None:
                raise BadRequest(
                    description=f"`{label_name}` does not have label value with id `{label_values}`"
                )
            values.append(value)

    segmentation.values = values
    return segmentation


@api.route("/data", methods=["POST"])
def add_data():
    api_key = request.headers.get("Authorization", None)

    if not api_key:
        raise BadRequest(description="API Key missing from `Authorization` Header")

    project = Project.query.filter_by(api_key=api_key).first()

    if not project:
        raise NotFound(description="No project exist with given API Key")

    username = request.form.get("username", None)
    user = User.query.filter_by(username=username).first()

    if not user:
        raise NotFound(description="No user found with given username")

    segmentations = request.form.get("segmentations", "[]")
    reference_transcription = request.form.get("reference_transcription", None)
    is_marked_for_review = bool(request.form.get("is_marked_for_review", False))
    audio_file = request.files["audio_file"]
    original_filename = secure_filename(audio_file.filename)
    youtube_start_time = request.form.get("youtube_start_time", None)
    youtube_end_time = request.form.get("youtube_end_time", None)

    extension = Path(original_filename).suffix.lower()

    if len(extension) > 1 and extension[1:] not in ALLOWED_EXTENSIONS:
        raise BadRequest(description="File format is not supported")

    filename = f"{str(uuid.uuid4().hex)}{extension}"

    file_path = Path(app.config["UPLOAD_FOLDER"]).joinpath(filename)
    audio_file.save(file_path.as_posix())

    data = Data(
        project_id=project.id,
        filename=filename,
        original_filename=original_filename,
        reference_transcription=reference_transcription,
        is_marked_for_review=is_marked_for_review,
        assigned_user_id=user.id,
        youtube_start_time=youtube_start_time,
        youtube_end_time=youtube_end_time,
    )
    db.session.add(data)
    db.session.flush()

    segmentations = json.loads(segmentations)

    new_segmentations = []

    for segment in segmentations:
        validated = validate_segmentation(segment)

        if not validated:
            raise BadRequest(description=f"Segmentations have missing keys.")

        new_segment = generate_segmentation(
            data_id=data.id,
            project_id=project.id,
            end_time=float(segment["end_time"]),
            start_time=float(segment["start_time"]),
            annotations=segment.get("annotations", {}),
            transcription=segment["transcription"],
        )

        new_segmentations.append(new_segment)

    data.set_segmentations(new_segmentations)

    db.session.commit()
    db.session.refresh(data)

    return (
        jsonify(
            data_id=data.id,
            message=f"Data uploaded, created and assigned successfully",
            type="DATA_CREATED",
        ),
        201,
    )

@api.route("/register-dataset", methods=["POST"])
def register_dataset():
    api_key = request.headers.get("Authorization", None)

    if not api_key:
        raise BadRequest(description="API Key missing from `Authorization` Header")

    project = Project.query.filter_by(api_key=api_key).first()

    if not project:
        raise NotFound(description="No project exist with given API Key")

    username = request.form.get("username", None)
    user = User.query.filter_by(username=username).first()

    if not user:
        raise NotFound(description="No user found with given username")

    reference_transcriptions = request.form.getlist("reference_transcriptions")
    audio_files = request.form.getlist("audio_filenames")
    original_filenames = [secure_filename(audio_file) for audio_file in audio_files]
    uuid_filenames = request.form.getlist("uuid_filenames")
    youtube_start_times = request.form.getlist("youtube_start_times")
    youtube_end_times = request.form.getlist("youtube_end_times")

    if len(original_filenames) != len(uuid_filenames):
        raise BadRequest(description="Number of original filenames and uuid filenames are not equal")
    
    if len(original_filenames) != len(youtube_start_times):
        raise BadRequest(description="Number of original filenames and youtube start times are not equal")
    
    if len(original_filenames) != len(youtube_end_times):
        raise BadRequest(description="Number of original filenames and youtube end times are not equal")

    if len(original_filenames) != len(reference_transcriptions):
        raise BadRequest(description="Number of original filenames and reference transcriptions are not equal")

    for original_filename, uuid_filename, youtube_start_time, youtube_end_time, reference_transcription\
        in zip(original_filenames, uuid_filenames, youtube_start_times, youtube_end_times, reference_transcriptions):
        extension = Path(original_filename).suffix.lower()

        if len(extension) > 1 and extension[1:] not in ALLOWED_EXTENSIONS:
            raise BadRequest(description="File format is not supported")

        data = Data(
            project_id=project.id,
            filename=uuid_filename,
            original_filename=original_filename,
            reference_transcription=reference_transcription,
            is_marked_for_review=False,
            assigned_user_id=user.id,
            youtube_start_time=youtube_start_time,
            youtube_end_time=youtube_end_time,
        )
        db.session.add(data)
        db.session.flush()

        db.session.commit()
        db.session.refresh(data)

    return (
        jsonify(
            data_id=data.id,
            message=f"Data uploaded, created and assigned successfully",
            type="DATA_CREATED",
        ),
        201,
    )
