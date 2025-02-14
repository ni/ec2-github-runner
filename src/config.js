const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    this.input = {
      mode: core.getInput('mode'),
      githubToken: core.getInput('github-token'),
      ec2ImageId: core.getInput('ec2-image-id'),
      ec2InstanceType: core.getInput('ec2-instance-type'),
      ec2BaseOs: core.getInput('ec2-base-os'),
      subnetId: core.getInput('subnet-id'),
      securityGroupId: core.getInput('security-group-id'),
      label: core.getInput('label'),
      ec2InstanceIds: JSON.parse(core.getInput('ec2-instance-ids')),
      iamRoleName: core.getInput('iam-role-name'),
      numberOfRunners: core.getInput('number-of-runners'),
      numberOfInstances: core.getInput('number-of-instances'),
      ec2LaunchTemplate: core.getInput('ec2-launch-template'),
      githubRegistrationTimeout: core.getInput('github-registration-timeout'),
    };

    const tags = JSON.parse(core.getInput('aws-resource-tags'));
    tags.push({"Key":"Name","Value":"ec2-github-runner"});
    tags.push({"Key":"GITHUB_RUN_ID","Value":github.context.runId.toString()});
    tags.push({"Key":"GITHUB_RUN_NUMBER","Value":github.context.runNumber.toString()});
    tags.push({"Key":"GITHUB_WORKFLOW","Value":github.context.workflow});
    tags.push({"Key":"GITHUB_REPOSITORY","Value":github.context.repo.repo});
    this.tagSpecifications = [{ResourceType: 'instance', Tags: tags}, {ResourceType: 'volume', Tags: tags}];

    // the values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action on the runtime
    this.githubContext = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
    };

    //
    // validate input
    //

    if (!this.input.mode) {
      throw new Error(`The 'mode' input is not specified`);
    }

    if (!this.input.githubToken) {
      throw new Error(`The 'github-token' input is not specified`);
    }

    if (isNaN(parseInt(this.input.githubRegistrationTimeout))) {
      throw new Error(`The 'github-registration-timeout' input is not an integer`);
    }

    if (isNaN(parseInt(this.input.numberOfRunners))) {
      throw new Error(`The 'number-of-runners' input is not an integer`);
    }

    if (isNaN(parseInt(this.input.numberOfInstances))) {
      throw new Error(`The 'number-of-instances' input is not an integer`);
    }

    if (this.input.mode === 'start') {
      const isSet = param => param;
      const instanceParams = [this.input.ec2ImageId, this.input.ec2InstanceType, this.input.ec2BaseOs, this.input.subnetId, this.input.securityGroupId];
      const templateParams = [this.input.ec2LaunchTemplate, this.input.ec2BaseOs];

      if (!(instanceParams.every(isSet) || templateParams.every(isSet) )) {
        throw new Error(`Not all the required inputs are provided for the 'start' mode`);
      }

      if (this.input.ec2BaseOs !== 'win-x64' && this.input.ec2BaseOs !== 'linux-x64' && this.input.ec2BaseOs !== 'linux-arm' && this.input.ec2BaseOs !== 'linux-arm64') {
        throw new Error(`Wrong base-os. Allowed values: win-x64, linux-x64, linux-arm or linux-arm64.`);
      }
    } else if (this.input.mode === 'stop') {
      if (!this.input.label || !this.input.ec2InstanceIds) {
        throw new Error(`Not all the required inputs are provided for the 'stop' mode`);
      }
    } else {
      throw new Error('Wrong mode. Allowed values: start, stop.');
    }
  }

  generateUniqueLabel() {
    return Math.random().toString(36).substr(2, 5);
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}
