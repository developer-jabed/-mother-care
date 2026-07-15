import httpStatus from 'http-status';
import ApiError from '../../errors/api.error.js';
export const resolveGrade = (percentage, gradingScales) => {
    const match = gradingScales.find(scale => percentage >= scale.minPercentage && percentage <= scale.maxPercentage);
    if (!match) {
        throw new ApiError(httpStatus.BAD_REQUEST, `No grading scale defined for percentage ${percentage}. Check GradingScale configuration for this academic year.`);
    }
    return { grade: match.grade, gradePoint: match.gradePoint };
};
export const calculateSubjectRawTotal = (detail) => {
    return ((detail.writtenMarks ?? 0) +
        (detail.mcqMarks ?? 0) +
        (detail.practicalMarks ?? 0) +
        (detail.vivaMarks ?? 0));
};
//# sourceMappingURL=result.utils.js.map