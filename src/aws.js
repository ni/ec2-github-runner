const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

const runnerVersion = '2.285.1'

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label, instance) {
  const userData = [];

  if (config.input.ec2BaseOs === 'win-x64') {
    userData.push(
      '<powershell>',
      'mkdir c:/actions-runner; cd c:/actions-runner',
      `Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.zip -OutFile actions-runner-win-x64-${runnerVersion}.zip`,
    );
    
    for (let i = 1; i <= parseInt(config.input.numberOfRunners); i++) {
      userData.push(
        `mkdir ${i}; cd ${i}`,
        `Expand-Archive -Path ./../actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.zip -DestinationPath $PWD`,
        'mkdir _work',
        `./config.cmd --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --name ${config.input.ec2BaseOs}-${label}-${instance}-${i} --token ${githubRegistrationToken} --labels ${label} --unattended`,
        'Start-Process -FilePath ./run.cmd',
        'cd ..',
      );
    }

    userData.push(    
      '</powershell>',
    );
  }
  else if (config.input.ec2BaseOs === 'linux-x64' || config.input.ec2BaseOs === 'linux-arm' || config.input.ec2BaseOs === 'linux-arm64'){
    userData.push(
      '#!/bin/bash',
      'su - ec2-user',
      'mkdir actions-runner && cd actions-runner',
      `curl -O -L https://github.com/actions/runner/releases/download/v${runnerVersion}/actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.tar.gz`,
      'export RUNNER_ALLOW_RUNASROOT=1',
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
    );

    for (let i = 1; i <= parseInt(config.input.numberOfRunners); i++) {
      userData.push(
        `mkdir ${i} && cd ${i}`,
        `tar xzf ./../actions-runner-${config.input.ec2BaseOs}-${runnerVersion}.tar.gz`,
        `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --name ${config.input.ec2BaseOs}-${label}-${instance}-${i} --token ${githubRegistrationToken} --labels ${label}`,
        './run.sh &',
        'cd ..',
      );
    }
  } else {
    core.error('Not supported ec2-base-os.');
  }

  return userData;
}

async function startEc2Instance(label, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  

  const params = {
    MinCount: 1,
    MaxCount: 1,
  };

  if (config.input.ec2LaunchTemplate) {
    params.LaunchTemplate = {
      LaunchTemplateName: config.input.ec2LaunchTemplate
    };
  }

  if(config.input.ec2ImageId) {
    params.ImageId = config.input.ec2ImageId;
  }

  if(config.input.ec2InstanceType) {
    params.InstanceType = config.input.ec2InstanceType;
  }

  if(config.input.subnetId) {
    params.SubnetId = config.input.subnetId;
  }

  if(config.input.securityGroupId) {
    params.SecurityGroupIds = [config.input.securityGroupId];
  }

  if(config.input.iamRoleName) {
    params.IamInstanceProfile = { 
      Name: config.input.iamRoleName 
    };
  }

  if(config.tagSpecifications) {
    params.TagSpecifications = config.tagSpecifications;
  }

  const ec2InstanceIds = []

  for (let i = 1; i <= parseInt(config.input.numberOfInstances); i++) {
    const userData = buildUserDataScript(githubRegistrationToken, label, i);
    params.UserData = Buffer.from(userData.join('\n')).toString('base64');

    try {
      const result = await ec2.runInstances(params).promise();
      const ec2InstanceId = result.Instances[0].InstanceId
      ec2InstanceIds.push(ec2InstanceId);
      core.info(`AWS EC2 instance ${ec2InstanceId} is started`);  
    } catch (error) {
      core.error('AWS EC2 instance starting error');
      throw error;
    }
  }

  return ec2InstanceIds;
}

async function terminateEc2Instance() {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: config.input.ec2InstanceIds,
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instances ${config.input.ec2InstanceIds} are terminated`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${config.input.ec2InstanceIds} termination error`);
    throw error;
  }
}

async function waitForInstanceRunning(ec2InstanceIds) {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: ec2InstanceIds,
  };

  try {
    await ec2.waitFor('instanceRunning', params).promise();
    core.info(`AWS EC2 instance ${ec2InstanceIds} are up and running`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances ${ec2InstanceIds} initialization error`);
    throw error;
  }
}

module.exports = {
  startEc2Instance,
  terminateEc2Instance,
  waitForInstanceRunning,
};
